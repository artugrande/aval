import type {Address, Hex} from "viem";

import {functionsBaseUrl} from "./supabase";

export interface KybReviewInput {
    wallet: Address;
    chainId: number;
    businessName: string;
    website: string;
    country: "MX" | "AR" | "BR" | "CO" | "PE" | "CL" | "UY" | string;
    taxIdHash?: Hex;
    industry: string;
    businessModel: string;
    monthlyVolume: string;
    repFullName: string;
    repRole: string;
    repEmail: string;
    repLinkedin?: string;
}

export type WavyRiskLevel = "minimal" | "low" | "medium" | "high" | "critical";

export interface WavynodeAml {
    /** 0–100 risk score from WavyNode's analysis (null = analysis still running). */
    riskScore: number | null;
    riskLevel: WavyRiskLevel | null;
    riskReason: string | null;
    /** True if WavyNode explicitly flagged suspicious activity. */
    suspicious: boolean | null;
    patternsDetected: number | null;
    txAnalyzed: number | null;
    analysisId: string | null;
    /** ISO timestamp when scan-risk last returned results. */
    scannedAt: string | null;
    /** ISO timestamp when the wallet was registered for ongoing monitoring. */
    registeredAt: string | null;
}

export interface KybReviewResponse {
    decision: "approve" | "reject";
    reason: string;
    /** `ai_unavailable` is a soft failure — the form data is preserved and no attempt is counted. */
    status: "approved" | "rejected" | "ai_unavailable";
    attempts: number;
    onchainTxHashes: {fuji: string | null; l1: string | null};
    wavynode: WavynodeAml | null;
}

export interface KybStatusResponse {
    status: "none" | "pending_review" | "approved" | "rejected";
    aiReason: string | null;
    attempts: number;
    businessName: string | null;
    onchainTxHash: string | null;
    onchainChainId: number | null;
    wavynode: WavynodeAml | null;
}

export interface BootstrapState {
    level: number; // 0 (blacklisted) | 1..11
    repaidCount: number;
    hasDefault?: boolean;
    maxLevel?: number;
    nextLevelCapUsd: number | null;
}

export interface AttestationResponse {
    attestation: {
        borrower: Address;
        maxCap: string; // bigint as decimal string
        expiresAt: string;
        nonce: string;
        scoreId: Hex;
    };
    signature: Hex;
    signer: Address;
    bootstrap: BootstrapState & {score: number; maxCapUsd: number};
}

async function callSupabase<T>(path: string, body: unknown): Promise<T> {
    const base = functionsBaseUrl();
    if (!base) throw new Error("Supabase not configured (set NEXT_PUBLIC_SUPABASE_URL).");
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return withRetry(`${base}${path}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(key ? {authorization: `Bearer ${key}`, apikey: key} : {}),
        },
        body: JSON.stringify(body),
    });
}

/// Resilient JSON-fetch wrapper used by both local Next.js routes and Supabase
/// edge functions.
///   - 90s timeout via AbortController so the browser doesn't bail on Vercel
///     cold starts or long Claude reviews.
///   - Retries once on transient network errors ('Failed to fetch',
///     NetworkError, AbortError). Server-side 4xx/5xx throw via `!res.ok` and
///     are NOT retried — those bubble up with the body's error field.
///   - On final 'Failed to fetch' surfaces a clearer Spanish message hinting
///     at the likely cause (ad blocker, extension, network).
async function withRetry<T>(url: string, init: RequestInit): Promise<T> {
    const TIMEOUT_MS = 90_000;
    const attempts = 2;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {...init, signal: ctl.signal});
            clearTimeout(timer);
            const data = await res.json().catch(() => ({error: "non_json_response"}));
            if (!res.ok) {
                throw new Error(typeof data === "object" && data && "error" in data ? String(data.error) : "request_failed");
            }
            return data as T;
        } catch (e) {
            clearTimeout(timer);
            lastErr = e;
            const msg = e instanceof Error ? e.message : "";
            const isTransient =
                msg === "Failed to fetch" ||
                msg.includes("NetworkError") ||
                msg.includes("aborted") ||
                msg.includes("network") ||
                (e instanceof DOMException && e.name === "AbortError");
            if (!isTransient || i === attempts - 1) break;
            await new Promise((r) => setTimeout(r, 800));
        }
    }
    if (lastErr instanceof Error && lastErr.message === "Failed to fetch") {
        throw new Error(
            "No pudimos contactar al servidor (puede ser un ad blocker, una extensión, o un blip de red). Probá de nuevo, o desactivá temporalmente extensiones del browser.",
        );
    }
    throw lastErr instanceof Error ? lastErr : new Error("request_failed");
}

async function callLocal<T>(path: string, body: unknown): Promise<T> {
    return withRetry(path, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
    });
}

// KYB review runs on our Next.js API route (AI SDK + on-chain write).
export const kybReview = (input: KybReviewInput) => callLocal<KybReviewResponse>("/api/kyb-review", input);

// Status + attestation stay on Supabase (lightweight reads).
export const kybStatus = (input: {wallet: Address}) => callSupabase<KybStatusResponse>("/kyb-status", input);
export const scoreAttest = (input: {wallet: Address; chainId?: number; ttlSeconds?: number}) =>
    callSupabase<AttestationResponse>("/score-attest", input);
