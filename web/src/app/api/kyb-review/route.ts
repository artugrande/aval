// app/api/kyb-review/route.ts
//
// POST /api/kyb-review
//   body: KybReviewInput (see lib/api.ts)
//   returns: { decision, reason, status, attempts, onchainTxHashes: { fuji?, l1? } }
//
// Flow:
//   1. Validate input
//   2. Upsert profile in Supabase as pending_review
//   3. Ask Claude (haiku) via AI SDK with a Zod schema for guaranteed JSON
//   4. If approved → fire BorrowerRegistry.addBorrower on BOTH chains in parallel
//   5. Update DB with final status + AI reason + tx hashes
//   6. Return result

import {anthropic} from "@ai-sdk/anthropic";
import {generateObject} from "ai";
import {createClient} from "@supabase/supabase-js";
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    toHex,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {avalancheFuji} from "viem/chains";
import {z} from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const SANCTIONED_COUNTRIES = ["CU", "IR", "KP", "SY", "RU", "BY", "MM"];
const HIGH_RISK_INDUSTRIES = ["crypto", "gambling", "adult", "weapons"];

const ReviewSchema = z.object({
    decision: z.enum(["approve", "reject"]),
    reason: z
        .string()
        .max(400)
        .describe(
            "Brief explanation in Spanish. If approved: confirm and welcome. If rejected: state SPECIFICALLY which field/check failed so the user can fix it. Address the user directly with 'tu/tus'.",
        ),
});

const BodySchema = z.object({
    wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "wallet must be a 0x-prefixed 40-char hex")
        .transform((v) => v.toLowerCase()),
    chainId: z.number().int().positive(),
    businessName: z.string().min(2).max(120),
    website: z.string().min(4).max(200),
    country: z.string().min(2).max(40),
    taxIdHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    industry: z.string().min(2).max(80),
    businessModel: z.string().min(2).max(80),
    monthlyVolume: z.string().min(1).max(40),
    primaryUseCase: z.string().min(2).max(120),
    repFullName: z.string().min(2).max(120),
    repRole: z.string().min(2).max(80),
    repEmail: z.string().email(),
    repLinkedin: z.string().url().optional().or(z.literal("").transform(() => undefined)),
});

const borrowerRegistryAbi = [
    {
        type: "function",
        name: "addBorrower",
        stateMutability: "nonpayable",
        inputs: [
            {name: "borrower", type: "address"},
            {name: "profileHash", type: "bytes32"},
        ],
        outputs: [],
    },
] as const;

export async function POST(req: Request) {
    // env
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const ISSUER_PRIVATE_KEY = process.env.ISSUER_PRIVATE_KEY as Hex | undefined;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const REGISTRY_FUJI = process.env.NEXT_PUBLIC_BORROWER_REGISTRY_ADDRESS as Address | undefined;
    const REGISTRY_L1 = process.env.NEXT_PUBLIC_L1_BORROWER_REGISTRY_ADDRESS as Address | undefined;
    const L1_RPC = process.env.NEXT_PUBLIC_AVAL_L1_RPC;
    const L1_CHAIN_ID = Number(process.env.NEXT_PUBLIC_AVAL_L1_CHAIN_ID ?? "0");

    if (
        !ANTHROPIC_API_KEY ||
        !ISSUER_PRIVATE_KEY ||
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY ||
        !REGISTRY_FUJI ||
        !REGISTRY_L1 ||
        !L1_RPC ||
        L1_CHAIN_ID === 0
    ) {
        return json({error: "server_misconfigured"}, 500);
    }

    // parse + validate body
    let body: z.infer<typeof BodySchema>;
    try {
        const raw = await req.json();
        body = BodySchema.parse(raw);
    } catch (e) {
        const msg = e instanceof z.ZodError ? e.issues : "invalid_json";
        return json({error: "invalid_body", detail: msg}, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Upsert pending_review
    const taxIdHash = body.taxIdHash ?? keccak256(toHex(`anon:${body.wallet}`));
    const {data: existing} = await supabase
        .from("business_profiles")
        .select("id, attempts")
        .eq("owner_wallet", body.wallet)
        .maybeSingle();

    const {data: profile, error: profErr} = await supabase
        .from("business_profiles")
        .upsert(
            {
                owner_wallet: body.wallet,
                tax_id_hash: taxIdHash,
                country_code: body.country,
                business_name: body.businessName,
                website: body.website,
                industry: body.industry,
                business_model: body.businessModel,
                monthly_volume: body.monthlyVolume,
                primary_use_case: body.primaryUseCase,
                rep_full_name: body.repFullName,
                rep_role: body.repRole,
                rep_email: body.repEmail,
                rep_linkedin: body.repLinkedin ?? null,
                kyb_status: "pending_review",
                attempts: (existing?.attempts ?? 0) + 1,
            },
            {onConflict: "owner_wallet"},
        )
        .select("id, attempts")
        .single();
    if (profErr || !profile) return json({error: "db_error", detail: profErr?.message}, 500);

    // 2. AI review via Claude haiku w/ structured output
    let decision: "approve" | "reject" = "reject";
    let reason = "No pudimos procesar tu solicitud. Probá de nuevo en unos minutos.";
    try {
        const result = await generateObject({
            model: anthropic("claude-haiku-4-5"),
            schema: ReviewSchema,
            prompt: buildPrompt(body),
        });
        decision = result.object.decision;
        reason = result.object.reason;
    } catch (e) {
        console.error("AI review error:", e);
    }

    // 3. If approved, write to BOTH chains in parallel
    const onchainTxHashes: {fuji: string | null; l1: string | null} = {fuji: null, l1: null};
    if (decision === "approve") {
        const account = privateKeyToAccount(ISSUER_PRIVATE_KEY);
        const profileHash = keccak256(toHex(`profile:${profile.id}:${Date.now()}`));

        const fujiChain = avalancheFuji;
        const l1Chain = defineChain({
            id: L1_CHAIN_ID,
            name: "Aval L1",
            nativeCurrency: {decimals: 18, name: "AVL", symbol: "AVL"},
            rpcUrls: {default: {http: [L1_RPC]}},
        });

        const writeToChain = async (chain: typeof fujiChain | typeof l1Chain, registry: Address) => {
            const wallet = createWalletClient({account, chain, transport: http()});
            const pub = createPublicClient({chain, transport: http()});
            const hash = await wallet.writeContract({
                address: registry,
                abi: borrowerRegistryAbi,
                functionName: "addBorrower",
                args: [body.wallet as Address, profileHash],
            });
            await pub.waitForTransactionReceipt({hash});
            return hash;
        };

        const [fujiRes, l1Res] = await Promise.allSettled([
            writeToChain(fujiChain, REGISTRY_FUJI),
            writeToChain(l1Chain, REGISTRY_L1),
        ]);
        if (fujiRes.status === "fulfilled") onchainTxHashes.fuji = fujiRes.value;
        else console.error("Fuji approval failed:", fujiRes.reason);
        if (l1Res.status === "fulfilled") onchainTxHashes.l1 = l1Res.value;
        else console.error("L1 approval failed:", l1Res.reason);

        if (!onchainTxHashes.fuji && !onchainTxHashes.l1) {
            decision = "reject";
            reason = "Aprobación on-chain falló. Reintentá en unos minutos.";
        }
    }

    // 4. Final DB update
    await supabase
        .from("business_profiles")
        .update({
            kyb_status: decision === "approve" ? "approved" : "rejected",
            ai_decision: decision,
            ai_reason: reason,
            ai_reviewed_at: new Date().toISOString(),
            onchain_tx_hash: onchainTxHashes.fuji ?? onchainTxHashes.l1 ?? null,
            onchain_chain_id: onchainTxHashes.fuji ? avalancheFuji.id : onchainTxHashes.l1 ? L1_CHAIN_ID : null,
        })
        .eq("id", profile.id);

    return json({
        decision,
        reason,
        status: decision === "approve" ? "approved" : "rejected",
        attempts: profile.attempts,
        onchainTxHashes,
    });
}

function buildPrompt(b: z.infer<typeof BodySchema>): string {
    return `Sos un revisor KYB (Know Your Business) para Aval, un protocolo de crédito sin garantía para PyMEs de LatAm.

Evaluá esta solicitud y decidí si aprobar al negocio para pedir préstamos en Aval.

Datos del negocio:
- Razón social: ${b.businessName}
- Website: ${b.website}
- País: ${b.country}
- Industria: ${b.industry}
- Modelo de negocio: ${b.businessModel}
- Volumen mensual esperado: ${b.monthlyVolume}
- Uso principal: ${b.primaryUseCase}
- Representante: ${b.repFullName} (${b.repRole})
- Email: ${b.repEmail}
- LinkedIn: ${b.repLinkedin ?? "no provisto"}

Aprobar SOLO si TODAS las siguientes condiciones se cumplen:
1. La razón social suena real (no "Test", "asdf", caracteres random, una sola letra, ni groserías)
2. El website es una URL plausible (tiene dominio real, no es "google.com" u otro sitio no relacionado)
3. La combinación de industria + modelo de negocio + uso principal tiene coherencia interna
4. El email parece corporativo y matchea el dominio del website, o es un email personal creíble
5. La URL de LinkedIn (si se provee) está en formato linkedin.com/in/...
6. El país NO está en la lista de sancionados: ${SANCTIONED_COUNTRIES.join(", ")}
7. La industria NO está en la lista de alto riesgo: ${HIGH_RISK_INDUSTRIES.join(", ")}
8. El nombre del representante parece una persona real (no "asdf", no "Test User")

Rechazar si CUALQUIERA de las condiciones falla.

La razón debe estar en español, dirigirse al usuario en segunda persona ("tu/tus"), y ser ESPECÍFICA sobre qué campo o check falló si rechazás.`;
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {"content-type": "application/json"},
    });
}
