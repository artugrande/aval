// supabase/functions/score-attest/index.ts
//
// POST /functions/v1/score-attest
//   body: { wallet: "0x..." , chainId?: number, ttlSeconds?: number }
//   returns: { attestation: {...}, signature: "0x..." }
//
// Signs an EIP-712 CreditAttestation with the protocol issuer key
// (env ISSUER_PRIVATE_KEY). The signer must already be whitelisted on-chain via
// IssuerRegistry.addIssuer(<signer address>).

import {createClient} from "npm:@supabase/supabase-js@2";
import {keccak256, toHex, type Address, type Hex} from "npm:viem@^2.21.0";
import {privateKeyToAccount} from "npm:viem/accounts";

import {corsHeaders} from "../_shared/cors.ts";
import {AVAL_TYPED_DATA_TYPES, avalDomain, type CreditAttestation} from "../_shared/eip712.ts";

const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const DEFAULT_CHAIN_ID = 43113; // Fuji

interface RequestBody {
    wallet?: string;
    chainId?: number;
    ttlSeconds?: number;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders});
    if (req.method !== "POST") return json({error: "method_not_allowed"}, 405);

    const ISSUER_PRIVATE_KEY = Deno.env.get("ISSUER_PRIVATE_KEY") as Hex | undefined;
    const CREDIT_MANAGER_ADDRESS = Deno.env.get("CREDIT_MANAGER_ADDRESS") as Address | undefined;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!ISSUER_PRIVATE_KEY || !CREDIT_MANAGER_ADDRESS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return json({error: "server_misconfigured"}, 500);
    }

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({error: "invalid_json"}, 400);
    }

    const wallet = body.wallet?.toLowerCase();
    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
        return json({error: "invalid_wallet"}, 400);
    }
    const chainId = body.chainId ?? DEFAULT_CHAIN_ID;
    const ttlSeconds = clamp(body.ttlSeconds ?? DEFAULT_TTL_SECONDS, 60, 7 * 86_400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Find approved business profile for this wallet.
    const {data: profile, error: profileErr} = await supabase
        .from("business_profiles")
        .select("id, kyb_status")
        .eq("owner_wallet", wallet)
        .maybeSingle();

    if (profileErr) return json({error: "db_error", detail: profileErr.message}, 500);
    if (!profile) return json({error: "no_profile"}, 404);
    if (profile.kyb_status !== "approved") return json({error: "kyb_not_approved", status: profile.kyb_status}, 403);

    // 2. Get latest score snapshot.
    const {data: snapshot, error: snapshotErr} = await supabase
        .from("score_snapshots")
        .select("id, max_cap_micro, issuer_nonce")
        .eq("business_id", profile.id)
        .order("computed_at", {ascending: false})
        .limit(1)
        .maybeSingle();

    if (snapshotErr) return json({error: "db_error", detail: snapshotErr.message}, 500);
    if (!snapshot) return json({error: "no_score"}, 404);

    // 3. Build the attestation.
    const account = privateKeyToAccount(ISSUER_PRIVATE_KEY);
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
    const scoreId = keccak256(toHex(snapshot.id));

    const att: CreditAttestation = {
        borrower: wallet as Address,
        maxCap: BigInt(snapshot.max_cap_micro),
        expiresAt,
        nonce: BigInt(snapshot.issuer_nonce ?? 0),
        scoreId,
    };

    // 4. Sign EIP-712.
    const signature = await account.signTypedData({
        domain: avalDomain(chainId, CREDIT_MANAGER_ADDRESS),
        types: AVAL_TYPED_DATA_TYPES,
        primaryType: "CreditAttestation",
        message: att,
    });

    // 5. Log attestation for audit trail.
    const {error: logErr} = await supabase.from("attestation_log").insert({
        business_id: profile.id,
        snapshot_id: snapshot.id,
        borrower_wallet: wallet,
        max_cap_micro: snapshot.max_cap_micro,
        expires_at: new Date(Number(expiresAt) * 1000).toISOString(),
        issuer_nonce: snapshot.issuer_nonce ?? 0,
        signature,
    });
    if (logErr) console.error("attestation_log insert failed:", logErr.message);

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
    });
});

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {...corsHeaders, "content-type": "application/json"},
    });
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}
