// supabase/functions/kyb-submit/index.ts
//
// POST /functions/v1/kyb-submit
//   body: {
//     wallet, taxIdHash, countryCode, legalName?, sector?, revenueBand?, ageMonths?
//   }
//   returns: { businessId, kybStatus, score?, maxCapMicro? }
//
// DEMO ONLY: this endpoint auto-approves submissions and produces a stub score.
// In production: documents go to Supabase Storage, a human reviewer flips
// kyb_status to 'approved', and a scoring pipeline writes the snapshot.

import {createClient} from "npm:@supabase/supabase-js@2";

import {corsHeaders} from "../_shared/cors.ts";

interface RequestBody {
    wallet?: string;
    taxIdHash?: string;
    countryCode?: string;
    legalName?: string;
    sector?: string;
    revenueBand?: "lt_50k" | "50k_500k" | "500k_5m" | "gt_5m";
    ageMonths?: number;
}

// Stub scoring: maps revenue band + age → a score 0..1000 and a credit cap.
function computeStubScore(input: {revenueBand?: string; ageMonths?: number}): {score: number; capMicro: number} {
    let score = 300; // base
    switch (input.revenueBand) {
        case "lt_50k":
            score += 50;
            break;
        case "50k_500k":
            score += 200;
            break;
        case "500k_5m":
            score += 400;
            break;
        case "gt_5m":
            score += 500;
            break;
    }
    const age = input.ageMonths ?? 0;
    score += Math.min(age, 60) * 3; // up to +180 for 5+ years
    score = Math.min(score, 1000);

    // Cap in USDC micro (6 decimals): linear in score, max 5,000 USDC.
    const capUsd = Math.floor((5_000 * score) / 1000);
    return {score, capMicro: capUsd * 1_000_000};
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders});
    if (req.method !== "POST") return json({error: "method_not_allowed"}, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({error: "server_misconfigured"}, 500);

    let body: RequestBody;
    try {
        body = await req.json();
    } catch {
        return json({error: "invalid_json"}, 400);
    }

    const wallet = body.wallet?.toLowerCase();
    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) return json({error: "invalid_wallet"}, 400);
    if (!body.taxIdHash || !/^0x[a-f0-9]{64}$/.test(body.taxIdHash)) return json({error: "invalid_tax_id_hash"}, 400);
    if (!body.countryCode || !["MX", "AR", "BR", "CO", "PE", "CL", "UY"].includes(body.countryCode)) {
        return json({error: "invalid_country"}, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert business profile.
    const {data: profile, error: profErr} = await supabase
        .from("business_profiles")
        .upsert(
            {
                owner_wallet: wallet,
                tax_id_hash: body.taxIdHash,
                country_code: body.countryCode,
                legal_name: body.legalName ?? null,
                sector: body.sector ?? null,
                revenue_band: body.revenueBand ?? null,
                age_months: body.ageMonths ?? null,
                kyb_status: "approved", // DEMO: auto-approve
            },
            {onConflict: "owner_wallet"},
        )
        .select("id")
        .single();

    if (profErr || !profile) return json({error: "db_error", detail: profErr?.message}, 500);

    const {score, capMicro} = computeStubScore({revenueBand: body.revenueBand, ageMonths: body.ageMonths});

    // Insert a fresh score snapshot. Bump issuer_nonce monotonically per business
    // by reading the latest and adding 1.
    const {data: latest} = await supabase
        .from("score_snapshots")
        .select("issuer_nonce")
        .eq("business_id", profile.id)
        .order("computed_at", {ascending: false})
        .limit(1)
        .maybeSingle();
    const nextNonce = (latest?.issuer_nonce ?? -1) + 1;

    const {error: snapErr} = await supabase.from("score_snapshots").insert({
        business_id: profile.id,
        score,
        max_cap_micro: capMicro,
        issuer_nonce: nextNonce,
        version: "v0-stub",
    });

    if (snapErr) return json({error: "score_insert_failed", detail: snapErr.message}, 500);

    return json({
        businessId: profile.id,
        kybStatus: "approved",
        score,
        maxCapMicro: capMicro,
        maxCapUsd: capMicro / 1_000_000,
    });
});

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {...corsHeaders, "content-type": "application/json"},
    });
}
