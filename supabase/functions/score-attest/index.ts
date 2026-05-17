// supabase/functions/score-attest/index.ts
//
// POST /functions/v1/score-attest
//   body: { wallet, chainId?, ttlSeconds? }
//   returns: { attestation, signature, signer, bootstrap }
//
// Bootstrap-by-repayment scoring + on-chain whitelist enforcement.
// Reads BorrowerRegistry.isApproved(wallet) before anything else — the
// on-chain registry is the source of truth; even if DB says approved, if the
// chain says no, we won't sign.
//
// Auto-defaults overdue loans before the hasDefault gate.
//
// Reads loans via Promise.all (NOT multicall) because Multicall3
// (0xcA11...CA11) is not deployed on Aval L1 (custom Subnet-EVM genesis).
// Individual readContract calls work on any EVM chain.

import {createClient} from "npm:@supabase/supabase-js@2";
import {createPublicClient, createWalletClient, defineChain, http, keccak256, toHex, type Address, type Hex, type TypedDataDomain} from "npm:viem@^2.21.0";
import {privateKeyToAccount} from "npm:viem/accounts";
import {avalancheFuji} from "npm:viem/chains";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAP_BY_LEVEL_USD = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 11000, 14500, 20000];
const MAX_LEVEL = 11;

// Public on-chain addresses for the L1 CreditManager (Aval L1 = chainId 45521).
// We can't read process.env-style envs for L1-specific stuff because the
// Supabase function only has CREDIT_MANAGER_ADDRESS set (Fuji). These are
// already public in NEXT_PUBLIC_L1_CREDIT_MANAGER_ADDRESS, so hardcoding
// them here is fine.
const CREDIT_MANAGER_L1_FALLBACK = "0x2a5F76A2BfECbda26B8D91d2D5773409985DE8b7" as Address;

const AVAL_TYPED_DATA_TYPES = {
    CreditAttestation: [
        {name: "borrower", type: "address"},
        {name: "maxCap", type: "uint256"},
        {name: "expiresAt", type: "uint64"},
        {name: "nonce", type: "uint256"},
        {name: "scoreId", type: "bytes32"},
    ],
} as const;

const creditManagerAbi = [
    {type: "function", name: "nextLoanId", stateMutability: "view", inputs: [], outputs: [{type: "uint256"}]},
    {type: "function", name: "loans", stateMutability: "view", inputs: [{type: "uint256"}], outputs: [
        {type: "address", name: "borrower"},
        {type: "uint256", name: "principal"},
        {type: "uint16", name: "feeBps"},
        {type: "uint64", name: "startedAt"},
        {type: "uint64", name: "maturityAt"},
        {type: "bool", name: "repaid"},
        {type: "bool", name: "defaulted"},
    ]},
    {type: "function", name: "usedNonces", stateMutability: "view", inputs: [{type: "address"}], outputs: [{type: "uint256"}]},
    {type: "function", name: "markDefault", stateMutability: "nonpayable", inputs: [{type: "uint256"}], outputs: []},
] as const;

const borrowerRegistryAbi = [
    {type: "function", name: "isApproved", stateMutability: "view",
     inputs: [{type: "address"}], outputs: [{type: "bool"}]},
] as const;

function avalDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
    return {name: "Aval", version: "1", chainId, verifyingContract};
}

type LoanTuple = readonly [string, bigint, number, bigint, bigint, boolean, boolean];

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders});
    if (req.method !== "POST") return json({error: "method_not_allowed"}, 405);

    try {
        return await handle(req);
    } catch (e) {
        console.error("[score-attest] unhandled:", e);
        return json({error: "internal", detail: e instanceof Error ? e.message : String(e)}, 500);
    }
});

async function handle(req: Request): Promise<Response> {
    const ISSUER_PRIVATE_KEY = Deno.env.get("ISSUER_PRIVATE_KEY") as Hex | undefined;
    const CREDIT_MANAGER_ADDRESS = Deno.env.get("CREDIT_MANAGER_ADDRESS") as Address | undefined;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const BORROWER_REGISTRY_FUJI = Deno.env.get("BORROWER_REGISTRY_FUJI") as Address | undefined;
    const BORROWER_REGISTRY_L1 = Deno.env.get("BORROWER_REGISTRY_L1") as Address | undefined;
    const AVAL_L1_RPC = Deno.env.get("AVAL_L1_RPC");
    const AVAL_L1_CHAIN_ID = Number(Deno.env.get("AVAL_L1_CHAIN_ID") ?? "0");
    const CREDIT_MANAGER_L1 = (Deno.env.get("CREDIT_MANAGER_L1") as Address | undefined) ?? CREDIT_MANAGER_L1_FALLBACK;

    if (!ISSUER_PRIVATE_KEY || !CREDIT_MANAGER_ADDRESS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
        !BORROWER_REGISTRY_FUJI || !BORROWER_REGISTRY_L1 || !AVAL_L1_RPC || AVAL_L1_CHAIN_ID === 0) {
        return json({error: "server_misconfigured"}, 500);
    }

    let body: {wallet?: string; chainId?: number; ttlSeconds?: number};
    try { body = await req.json(); } catch { return json({error: "invalid_json"}, 400); }

    const wallet = body.wallet?.toLowerCase();
    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) return json({error: "invalid_wallet"}, 400);
    const chainId = body.chainId ?? avalancheFuji.id;
    const ttlSeconds = Math.max(60, Math.min(body.ttlSeconds ?? 3600, 7 * 86_400));

    const isL1 = chainId === AVAL_L1_CHAIN_ID;
    const registryAddress = isL1 ? BORROWER_REGISTRY_L1 : BORROWER_REGISTRY_FUJI;
    const creditManagerAddr: Address = isL1 ? CREDIT_MANAGER_L1 : CREDIT_MANAGER_ADDRESS;
    const chain = isL1
        ? defineChain({
            id: AVAL_L1_CHAIN_ID, name: "Aval L1",
            nativeCurrency: {decimals: 18, name: "AVL", symbol: "AVL"},
            rpcUrls: {default: {http: [AVAL_L1_RPC]}},
        })
        : avalancheFuji;

    const client = createPublicClient({chain, transport: http()});

    // GATE 1: on-chain BorrowerRegistry.isApproved
    const onchainApproved = await client.readContract({
        address: registryAddress,
        abi: borrowerRegistryAbi,
        functionName: "isApproved",
        args: [wallet as Address],
    }) as boolean;
    if (!onchainApproved) return json({error: "not_whitelisted_onchain"}, 403);

    // GATE 2: DB profile + status
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {data: profile, error: profileErr} = await supabase
        .from("business_profiles")
        .select("id, kyb_status")
        .eq("owner_wallet", wallet)
        .maybeSingle();
    if (profileErr) return json({error: "db_error", detail: profileErr.message}, 500);
    if (!profile) return json({error: "no_profile"}, 404);
    if (profile.kyb_status !== "approved") return json({error: "kyb_not_approved", status: profile.kyb_status}, 403);

    // Bootstrap level from on-chain history.
    //
    // We read loans one-by-one via Promise.all rather than multicall because
    // Multicall3 (0xcA11...CA11) is NOT deployed on Aval L1 (custom Subnet-EVM
    // genesis). Sequential rpc reads are slightly slower but work everywhere.
    const nextLoanId = (await client.readContract({
        address: creditManagerAddr, abi: creditManagerAbi, functionName: "nextLoanId",
    })) as bigint;

    let repaidCount = 0;
    let hasDefault = false;
    const overdueIds: bigint[] = [];
    const nowSec = BigInt(Math.floor(Date.now() / 1000));

    if (nextLoanId > 0n) {
        const ids: bigint[] = [];
        for (let i = 1n; i <= nextLoanId; i++) ids.push(i);
        const loanReads = await Promise.all(ids.map(async (id) => {
            try {
                const tuple = (await client.readContract({
                    address: creditManagerAddr, abi: creditManagerAbi, functionName: "loans", args: [id],
                })) as LoanTuple;
                return {id, tuple};
            } catch {
                return null;
            }
        }));
        for (const r of loanReads) {
            if (!r) continue;
            const {id, tuple} = r;
            if (tuple[0].toLowerCase() !== wallet.toLowerCase()) continue;
            if (tuple[6]) hasDefault = true;
            else if (tuple[5]) repaidCount++;
            else if (tuple[4] < nowSec) overdueIds.push(id);
        }
    }

    // Auto-mark overdue loans as defaulted before deciding eligibility.
    if (overdueIds.length > 0) {
        const account = privateKeyToAccount(ISSUER_PRIVATE_KEY);
        const sender = createWalletClient({account, chain, transport: http()});
        for (const loanId of overdueIds) {
            try {
                const hash = await sender.writeContract({
                    address: creditManagerAddr,
                    abi: creditManagerAbi,
                    functionName: "markDefault",
                    args: [loanId],
                });
                await client.waitForTransactionReceipt({hash, timeout: 15_000});
                hasDefault = true;
                console.log(`[score-attest] auto-defaulted loan ${loanId.toString()} for ${wallet}`);
            } catch (e) {
                console.warn(`[score-attest] markDefault(${loanId.toString()}) failed:`, e);
            }
        }
    }

    const usedNonce = (await client.readContract({
        address: creditManagerAddr, abi: creditManagerAbi, functionName: "usedNonces", args: [wallet as Address],
    })) as bigint;

    if (hasDefault) return json({error: "blacklisted_due_to_default", level: 0}, 403);

    const level = Math.min(MAX_LEVEL, 1 + repaidCount);
    const capUsd = CAP_BY_LEVEL_USD[level];
    const capMicro = BigInt(capUsd) * 1_000_000n;
    const score = Math.floor((level / MAX_LEVEL) * 1000);

    const {data: snapshot, error: snapErr} = await supabase
        .from("score_snapshots")
        .insert({
            business_id: profile.id,
            score,
            max_cap_micro: capMicro.toString(),
            issuer_nonce: Number(usedNonce),
            version: `v1-bootstrap-L${level}`,
        })
        .select("id")
        .single();
    if (snapErr || !snapshot) return json({error: "snapshot_failed", detail: snapErr?.message}, 500);

    const account = privateKeyToAccount(ISSUER_PRIVATE_KEY);
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const scoreId = keccak256(toHex(snapshot.id));

    const att = {
        borrower: wallet as Address,
        maxCap: capMicro,
        expiresAt,
        nonce: usedNonce,
        scoreId,
    };

    const signature = await account.signTypedData({
        domain: avalDomain(chainId, creditManagerAddr),
        types: AVAL_TYPED_DATA_TYPES,
        primaryType: "CreditAttestation",
        message: att,
    });

    await supabase.from("attestation_log").insert({
        business_id: profile.id,
        snapshot_id: snapshot.id,
        borrower_wallet: wallet,
        max_cap_micro: capMicro.toString(),
        expires_at: new Date(Number(expiresAt) * 1000).toISOString(),
        issuer_nonce: Number(usedNonce),
        signature,
    });

    return json({
        attestation: {
            borrower: att.borrower,
            maxCap: att.maxCap.toString(),
            expiresAt: att.expiresAt.toString(),
            nonce: att.nonce.toString(),
            scoreId: att.scoreId,
        },
        signature,
        signer: account.address,
        bootstrap: {
            level,
            repaidCount,
            score,
            maxCapUsd: capUsd,
            nextLevelCapUsd: level > 0 && level < MAX_LEVEL ? CAP_BY_LEVEL_USD[level + 1] : null,
        },
    });
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {...corsHeaders, "content-type": "application/json"},
    });
}
