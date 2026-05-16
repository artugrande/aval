// app/api/kyb-review/route.ts
//
// POST /api/kyb-review
//   body: KybReviewInput (see lib/api.ts)
//   returns: { decision, reason, status, attempts,
//              onchainTxHashes: { fuji?, l1? },
//              wavynode: WavynodeAml | null }
//
// Flow:
//   1. Validate input
//   2. Upsert profile in Supabase as pending_review
//   3. Register the wallet with WavyNode for ongoing monitoring (parallel,
//      non-blocking — first registration also triggers the analysis)
//   4. Run WavyNode scan-risk on Ethereum mainnet (the most-indexed chain,
//      same address space as Avalanche). Hard-reject if flagged.
//   5. Ask Claude (haiku) via AI SDK with a Zod schema, passing AML context.
//   6. If approved → fire BorrowerRegistry.addBorrower on BOTH chains in parallel
//   7. Update DB with final status + AI reason + tx hashes + WavyNode results
//   8. Return result

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

import {
    isWavyFlagged,
    wavynodeConfigured,
    wavynodeRegisterAddress,
    wavynodeScanRisk,
    WAVYNODE_BASELINE_CHAIN_ID,
    type WavyScanRiskResult,
} from "@/lib/wavynode";

export const runtime = "nodejs";
export const maxDuration = 60;

const SANCTIONED_COUNTRIES = ["CU", "IR", "KP", "SY", "RU", "BY", "MM"];
const HIGH_RISK_INDUSTRIES = ["crypto", "gambling", "adult", "weapons"];

const ReviewSchema = z.object({
    decision: z.enum(["approve", "reject"]),
    reason: z
        .string()
        .max(800)
        .describe(
            "Brief explanation in Spanish (1-3 sentences, under 600 chars). If approved: confirm and welcome. If rejected: state SPECIFICALLY which field/check failed so the user can fix it. Address the user directly with 'tu/tus'.",
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

    // 2. WavyNode parallel calls: register for ongoing monitoring + scan risk.
    //    Registering first time also kicks off the analysis async — for a
    //    fresh wallet the scan call below may return nothing, which is fine.
    //    Both are best-effort: if WavyNode is misconfigured or times out,
    //    we still continue with the Claude review.
    const wavynodeEnabled = wavynodeConfigured();
    const [_registered, wavyScan] = await Promise.all([
        wavynodeEnabled
            ? wavynodeRegisterAddress(
                  body.wallet,
                  `Aval borrower · ${body.businessName}`,
                  profile.id,
              )
            : Promise.resolve(false),
        wavynodeEnabled ? wavynodeScanRisk(body.wallet, WAVYNODE_BASELINE_CHAIN_ID) : Promise.resolve(null),
    ]);

    const wavyFlagged = isWavyFlagged(wavyScan);

    // 3. AI review via Claude haiku w/ structured output.
    //    If WavyNode already flagged the wallet → short-circuit reject without
    //    burning a Claude call.
    let decision: "approve" | "reject" = "reject";
    let reason = "No pudimos procesar tu solicitud. Probá de nuevo en unos minutos.";

    if (wavyFlagged) {
        decision = "reject";
        reason = buildWavyRejectionMessage(wavyScan!);
    } else {
        // Try the AI review up to 2 times — first failure is often a schema
        // mismatch (Claude wrote a too-long reason, or returned text not JSON).
        // If both fail we surface 'ai_unavailable' instead of pretending it's
        // a real reject, so the user doesn't lose their form data and can
        // retry without 'attempts' going up.
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const result = await generateObject({
                    model: anthropic("claude-haiku-4-5"),
                    schema: ReviewSchema,
                    prompt: buildPrompt(body, wavyScan),
                });
                decision = result.object.decision;
                reason = result.object.reason;
                lastError = null;
                break;
            } catch (e) {
                lastError = e;
                console.error(`AI review error (attempt ${attempt}):`, e);
            }
        }
        if (lastError) {
            // Roll back the attempts increment — this wasn't a real review
            // (Anthropic / network failure). Also rewind kyb_status.
            await supabase
                .from("business_profiles")
                .update({
                    kyb_status: existing ? "pending_review" : "pending",
                    attempts: existing?.attempts ?? 0,
                })
                .eq("id", profile.id);
            return json({
                decision: "reject",
                reason:
                    "El revisor con IA no respondió ahora mismo. No te descontamos un intento — probá de nuevo en unos segundos. Tus datos del formulario quedan como estaban.",
                status: "ai_unavailable",
                attempts: existing?.attempts ?? 0,
                onchainTxHashes: {fuji: null, l1: null},
                wavynode: null,
            }, 200);
        }
    }

    // 4. If approved, write to BOTH chains in parallel
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

    // 5. Final DB update, including WavyNode metadata.
    const wavyUpdate: Record<string, unknown> = wavynodeEnabled
        ? {wavynode_registered_at: new Date().toISOString()}
        : {};
    if (wavyScan) {
        wavyUpdate.wavynode_risk_score = wavyScan.riskScore ?? null;
        wavyUpdate.wavynode_risk_level = wavyScan.riskLevel ?? null;
        wavyUpdate.wavynode_risk_reason = wavyScan.riskReason ?? null;
        wavyUpdate.wavynode_suspicious = wavyScan.suspiciousActivity ?? null;
        wavyUpdate.wavynode_patterns_detected = wavyScan.patternsDetected ?? null;
        wavyUpdate.wavynode_tx_analyzed = wavyScan.transactionsAnalyzed ?? null;
        wavyUpdate.wavynode_analysis_id = wavyScan.analysisId ?? null;
        wavyUpdate.wavynode_scanned_at = wavyScan.completedAt ?? new Date().toISOString();
    }

    await supabase
        .from("business_profiles")
        .update({
            kyb_status: decision === "approve" ? "approved" : "rejected",
            ai_decision: decision,
            ai_reason: reason,
            ai_reviewed_at: new Date().toISOString(),
            onchain_tx_hash: onchainTxHashes.fuji ?? onchainTxHashes.l1 ?? null,
            onchain_chain_id: onchainTxHashes.fuji ? avalancheFuji.id : onchainTxHashes.l1 ? L1_CHAIN_ID : null,
            ...wavyUpdate,
        })
        .eq("id", profile.id);

    return json({
        decision,
        reason,
        status: decision === "approve" ? "approved" : "rejected",
        attempts: profile.attempts,
        onchainTxHashes,
        wavynode: wavyScan
            ? {
                  riskScore: wavyScan.riskScore ?? null,
                  riskLevel: wavyScan.riskLevel ?? null,
                  riskReason: wavyScan.riskReason ?? null,
                  suspicious: wavyScan.suspiciousActivity ?? null,
                  patternsDetected: wavyScan.patternsDetected ?? null,
                  txAnalyzed: wavyScan.transactionsAnalyzed ?? null,
                  analysisId: wavyScan.analysisId ?? null,
                  scannedAt: wavyScan.completedAt ?? null,
                  registeredAt: wavynodeEnabled ? new Date().toISOString() : null,
              }
            : wavynodeEnabled
              ? {
                    riskScore: null,
                    riskLevel: null,
                    riskReason: null,
                    suspicious: null,
                    patternsDetected: null,
                    txAnalyzed: null,
                    analysisId: null,
                    scannedAt: null,
                    registeredAt: new Date().toISOString(),
                }
              : null,
    });
}

function buildPrompt(b: z.infer<typeof BodySchema>, wavy: WavyScanRiskResult | null): string {
    const wavyBlock = wavy
        ? `
Resultado del escaneo AML on-chain (WavyNode) sobre la wallet del solicitante en Ethereum:
- Risk score: ${wavy.riskScore}/100 (nivel: ${wavy.riskLevel ?? "desconocido"})
- Suspicious activity flag: ${wavy.suspiciousActivity ? "SÍ" : "no"}
- Patterns detected: ${wavy.patternsDetected}${wavy.patterns?.length ? ` (${wavy.patterns.join(", ")})` : ""}
- Transactions analyzed: ${wavy.transactionsAnalyzed}
- Razón: ${wavy.riskReason ?? "sin observaciones"}

Si el score es ≤ 20 y no hay flags, tratá esta wallet como limpia desde el punto de vista AML.`
        : "\nEl escaneo AML on-chain (WavyNode) no devolvió resultados todavía — usá solo los datos del formulario para evaluar.";

    return `Sos un revisor KYB (Know Your Business) para Aval, un protocolo de crédito sin garantía para PyMEs de LatAm.

Evaluá esta solicitud y decidí si aprobar al negocio para pedir préstamos en Aval.

Datos del negocio:
- Razón social: ${b.businessName}
- Website: ${b.website}
- País: ${b.country}
- Industria: ${b.industry}
- Modelo de negocio: ${b.businessModel}
- Ingresos mensuales recurrentes: ${b.monthlyVolume}
- Representante: ${b.repFullName} (${b.repRole})
- Email: ${b.repEmail}
- LinkedIn: ${b.repLinkedin ?? "no provisto"}
${wavyBlock}

Aprobar SOLO si TODAS las siguientes condiciones se cumplen:
1. La razón social suena real (no "Test", "asdf", caracteres random, una sola letra, ni groserías)
2. El website es una URL plausible (tiene dominio real, no es "google.com" u otro sitio no relacionado)
3. La combinación de industria + modelo de negocio + volumen mensual tiene coherencia interna
4. El email parece corporativo y matchea el dominio del website, o es un email personal creíble
5. La URL de LinkedIn (si se provee) está en formato linkedin.com/in/...
6. El país NO está en la lista de sancionados: ${SANCTIONED_COUNTRIES.join(", ")}
7. La industria NO está en la lista de alto riesgo: ${HIGH_RISK_INDUSTRIES.join(", ")}
8. El nombre del representante parece una persona real (no "asdf", no "Test User")
9. El escaneo AML on-chain no flaggeó la wallet (si hay datos, el score debe ser ≤ 20 y sin "suspicious activity")

Rechazar si CUALQUIERA de las condiciones falla.

La razón debe estar en español, dirigirse al usuario en segunda persona ("tu/tus"), y ser ESPECÍFICA sobre qué campo o check falló si rechazás.`;
}

function buildWavyRejectionMessage(w: WavyScanRiskResult): string {
    const parts: string[] = [];
    parts.push(`Tu wallet fue rechazada por el escaneo AML on-chain de WavyNode`);
    if (typeof w.riskScore === "number") parts.push(`(score ${w.riskScore}/100, nivel "${w.riskLevel ?? "alto"}")`);
    if (w.suspiciousActivity) parts.push("— se detectó actividad sospechosa");
    if (w.patternsDetected > 0) parts.push(`— ${w.patternsDetected} patrones de riesgo`);
    parts.push(".");
    parts.push("Por compliance no podemos aprobar wallets con este nivel de riesgo. Probá con otra wallet limpia.");
    return parts.join(" ");
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {"content-type": "application/json"},
    });
}
