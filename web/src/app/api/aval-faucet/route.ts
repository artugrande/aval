// app/api/aval-faucet/route.ts
//
// POST /api/aval-faucet
//   body: { wallet: "0x..." }
//   returns: { status: "sent" | "skipped" | "rate_limited", txHash?, balance?, reason? }
//
// Sends 0.02 AVL from the issuer wallet to the requester so they can pay gas
// on Aval L1. Cheap insurance for first-time visitors who don't have AVL yet.
//
// Anti-abuse:
//   1. One funding per wallet — stored in public.aval_faucet_log
//   2. Skip if wallet already has > MIN_BALANCE on L1
//   3. Global daily cap (DAILY_WALLET_CAP) — protects the issuer from spam
//   4. Per-IP rate limit (PER_IP_HOURLY_LIMIT) via SHA256(ip)
//
// All checks are best-effort; the unique index on wallet is the hard guarantee
// against double-funding the same address.

import {createClient} from "@supabase/supabase-js";
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    formatEther,
    http,
    isAddress,
    parseEther,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {createHash} from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const AMOUNT_WEI = parseEther("0.02"); // 0.02 AVL — enough for ~50–100 txs
const MIN_BALANCE_WEI = parseEther("0.005"); // skip if they already have this
const DAILY_WALLET_CAP = 500; // max wallets fundable per UTC day
const PER_IP_HOURLY_LIMIT = 5; // max distinct wallets per IP per rolling hour

export async function POST(req: Request) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ISSUER_PRIVATE_KEY = process.env.ISSUER_PRIVATE_KEY as Hex | undefined;
    const L1_RPC = process.env.NEXT_PUBLIC_AVAL_L1_RPC;
    const L1_CHAIN_ID = Number(process.env.NEXT_PUBLIC_AVAL_L1_CHAIN_ID ?? "0");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ISSUER_PRIVATE_KEY || !L1_RPC || L1_CHAIN_ID === 0) {
        return json({status: "error", reason: "server_misconfigured"}, 500);
    }

    let body: {wallet?: string};
    try {
        body = await req.json();
    } catch {
        return json({status: "error", reason: "invalid_json"}, 400);
    }
    const wallet = body.wallet?.toLowerCase();
    if (!wallet || !isAddress(wallet)) {
        return json({status: "error", reason: "invalid_wallet"}, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Dedupe: already funded?
    const {data: existing} = await supabase
        .from("aval_faucet_log")
        .select("tx_hash, sent_at")
        .eq("wallet", wallet)
        .maybeSingle();
    if (existing) {
        return json({
            status: "skipped",
            reason: "already_funded",
            txHash: existing.tx_hash,
            sentAt: existing.sent_at,
        });
    }

    // 2. Per-IP rate limit (best-effort)
    const ipHash = hashIp(req);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const {count: ipCount} = await supabase
        .from("aval_faucet_log")
        .select("id", {count: "exact", head: true})
        .eq("ip_hash", ipHash)
        .gte("sent_at", oneHourAgo);
    if ((ipCount ?? 0) >= PER_IP_HOURLY_LIMIT) {
        return json({status: "rate_limited", reason: "ip_hourly_limit"}, 429);
    }

    // 3. Global daily cap
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const {count: todayCount} = await supabase
        .from("aval_faucet_log")
        .select("id", {count: "exact", head: true})
        .gte("sent_at", todayStart.toISOString());
    if ((todayCount ?? 0) >= DAILY_WALLET_CAP) {
        return json({status: "rate_limited", reason: "daily_cap"}, 429);
    }

    // 4. On-chain: does the wallet already have enough AVL?
    const l1 = defineChain({
        id: L1_CHAIN_ID,
        name: "Aval L1",
        nativeCurrency: {decimals: 18, name: "AVL", symbol: "AVL"},
        rpcUrls: {default: {http: [L1_RPC]}},
    });
    const pub = createPublicClient({chain: l1, transport: http()});

    let walletBalance: bigint;
    try {
        walletBalance = await pub.getBalance({address: wallet as Address});
    } catch (e) {
        return json({status: "error", reason: "rpc_balance_failed", detail: String(e)}, 502);
    }
    if (walletBalance >= MIN_BALANCE_WEI) {
        // Record so we don't keep checking on every page load — they're set.
        // Best-effort: if the insert races with another request we just bail.
        try {
            await supabase.from("aval_faucet_log").insert({
                wallet,
                amount_wei: "0",
                tx_hash: null,
                chain_id: L1_CHAIN_ID,
                ip_hash: ipHash,
            });
        } catch {
            // ignore — unique constraint or transient error, the answer is the same
        }
        return json({
            status: "skipped",
            reason: "already_has_balance",
            balance: formatEther(walletBalance),
        });
    }

    // 5. Send the tx
    const account = privateKeyToAccount(ISSUER_PRIVATE_KEY);
    const sender = createWalletClient({account, chain: l1, transport: http()});

    let txHash: Hex;
    try {
        txHash = await sender.sendTransaction({
            to: wallet as Address,
            value: AMOUNT_WEI,
        });
    } catch (e) {
        return json({status: "error", reason: "tx_failed", detail: String(e)}, 502);
    }

    // 6. Wait for inclusion (don't block UI for too long)
    try {
        await pub.waitForTransactionReceipt({hash: txHash, timeout: 10_000});
    } catch {
        // Tx submitted but not yet mined — still record it. Frontend can keep going.
    }

    // 7. Log
    const {error: logError} = await supabase.from("aval_faucet_log").insert({
        wallet,
        amount_wei: AMOUNT_WEI.toString(),
        tx_hash: txHash,
        chain_id: L1_CHAIN_ID,
        ip_hash: ipHash,
    });
    // If the log fails because of the unique constraint, another concurrent request
    // got there first — that's fine, the tx still went out.
    if (logError && !/duplicate|unique/i.test(logError.message)) {
        console.error("[aval-faucet] failed to log:", logError);
    }

    return json({
        status: "sent",
        txHash,
        amount: formatEther(AMOUNT_WEI),
    });
}

function hashIp(req: Request): string {
    const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
    return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {"content-type": "application/json", "cache-control": "no-store"},
    });
}
