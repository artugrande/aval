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
    primaryUseCase: string;
    repFullName: string;
    repRole: string;
    repEmail: string;
    repLinkedin?: string;
}

export interface KybReviewResponse {
    decision: "approve" | "reject";
    reason: string;
    status: "approved" | "rejected";
    attempts: number;
    onchainTxHashes: {fuji: string | null; l1: string | null};
}

export interface KybStatusResponse {
    status: "none" | "pending_review" | "approved" | "rejected";
    aiReason: string | null;
    attempts: number;
    businessName: string | null;
    onchainTxHash: string | null;
    onchainChainId: number | null;
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
