import type {Address, Hex} from "viem";

import {functionsBaseUrl} from "./supabase";

export interface KybSubmitInput {
    wallet: Address;
    taxIdHash: Hex;
    countryCode: "MX" | "AR" | "BR" | "CO" | "PE" | "CL" | "UY";
    legalName?: string;
    sector?: string;
}

export interface BootstrapState {
    level: number; // 0 (blacklisted) | 1..11
    repaidCount: number;
    hasDefault?: boolean;
    maxLevel?: number;
    nextLevelCapUsd: number | null;
}

export interface KybSubmitResponse {
    businessId: string;
    kybStatus: "approved";
    level: number;
    score: number;
    maxCapMicro: number;
    maxCapUsd: number;
    bootstrap: BootstrapState;
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

async function call<T>(path: string, body: unknown): Promise<T> {
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

export const kybSubmit = (input: KybSubmitInput) => call<KybSubmitResponse>("/kyb-submit", input);
export const scoreAttest = (input: {wallet: Address; chainId?: number; ttlSeconds?: number}) =>
    call<AttestationResponse>("/score-attest", input);
