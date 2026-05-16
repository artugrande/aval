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
    status: "approved" | "rejected";
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
    const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(key ? {authorization: `Bearer ${key}`, apikey: key} : {}),
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({error: "non_json_response"}));
    if (!res.ok) throw new Error(typeof data === "object" && data && "error" in data ? String(data.error) : "request_failed");
    return data as T;
}

async function callLocal<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({error: "non_json_response"}));
    if (!res.ok) throw new Error(typeof data === "object" && data && "error" in data ? String(data.error) : "request_failed");
    return data as T;
}

// KYB review runs on our Next.js API route (AI SDK + on-chain write).
export const kybReview = (input: KybReviewInput) => callLocal<KybReviewResponse>("/api/kyb-review", input);

// Status + attestation stay on Supabase (lightweight reads).
export const kybStatus = (input: {wallet: Address}) => callSupabase<KybStatusResponse>("/kyb-status", input);
export const scoreAttest = (input: {wallet: Address; chainId?: number; ttlSeconds?: number}) =>
    callSupabase<AttestationResponse>("/score-attest", input);
