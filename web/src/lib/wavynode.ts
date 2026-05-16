// Server-only WavyNode client.
//
// WavyNode is the compliance layer of Aval:
//   1. AML scan on borrower wallets during KYB (sync sanity + async deep scan)
//   2. Address registration → ongoing monitoring + alerts
//   3. Regulatory PDF reports per country / period (MX, CO, SV, GT)
//
// All three live in this file as plain `fetch` calls. The API key + projectId
// are server-only env vars; never import this from a client component.
//
// Docs: https://docs.wavynode.com/api-reference/openapi.json

import "server-only";

const BASE_URL = "https://api.wavynode.com/v1";
// Most public addresses don't have analyses on Avalanche yet → we use Ethereum
// mainnet (chainId 1) as the baseline ground truth. The wallet address is the
// same across EVM chains, so any flag on Ethereum is a flag period.
export const WAVYNODE_BASELINE_CHAIN_ID = 1;

export type WavyRiskLevel = "minimal" | "low" | "medium" | "high" | "critical";

export interface WavyScanRiskResult {
    analysisId: string;
    address: string;
    chainId: string;
    riskScore: number; // 0-100
    riskLevel?: WavyRiskLevel;
    riskReason?: string;
    suspiciousActivity: boolean;
    patternsDetected: number;
    patterns?: string[];
    transactionsAnalyzed: number;
    completedAt: string;
}

export interface WavyScanRiskResponse {
    total: number;
    missing: number;
    results: WavyScanRiskResult[];
    missingAddresses?: string[];
}

export interface WavyReport {
    id: string;
    name?: string;
    period: string;
    countryCode: string;
    createdAt?: string;
    [key: string]: unknown;
}

export interface WavyReportDownload {
    filename: string;
    url: string; // signed download URL
    period?: string;
}

function env(): {apiKey: string; projectId: string} | null {
    const apiKey = process.env.WAVYNODE_API_KEY;
    const projectId = process.env.WAVYNODE_PROJECT_ID;
    if (!apiKey || !projectId) return null;
    return {apiKey, projectId};
}

export function wavynodeConfigured(): boolean {
    return env() !== null;
}

async function call<T>(path: string, init?: RequestInit & {timeoutMs?: number}): Promise<T> {
    const cfg = env();
    if (!cfg) throw new Error("wavynode_not_configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15_000);
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            ...init,
            signal: controller.signal,
            headers: {
                "x-api-key": `ApiKey ${cfg.apiKey}`,
                "content-type": "application/json",
                accept: "application/json",
                ...(init?.headers ?? {}),
            },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || (json as {success?: boolean}).success === false) {
            const msg = (json as {message?: string}).message ?? `wavynode_${res.status}`;
            throw new Error(msg);
        }
        return (json as {data: T}).data ?? (json as T);
    } finally {
        clearTimeout(timer);
    }
}

/// Risk scan one or more addresses (the latest cached analysis). Returns null
/// when WavyNode is not configured so callers can fall back gracefully.
export async function wavynodeScanRisk(
    address: string,
    chainId: number = WAVYNODE_BASELINE_CHAIN_ID,
    timeoutMs = 10_000,
): Promise<WavyScanRiskResult | null> {
    const cfg = env();
    if (!cfg) return null;
    try {
        const data = await call<WavyScanRiskResponse>(
            `/projects/${cfg.projectId}/addresses/scan-risk?addresses=${address}&chainId=${chainId}`,
            {method: "GET", timeoutMs},
        );
        return data.results?.[0] ?? null;
    } catch {
        return null;
    }
}

/// Register an address for ongoing monitoring + alerts. Also triggers an
/// analysis the first time so the next scan-risk call has data.
export async function wavynodeRegisterAddress(
    address: string,
    description: string,
    foreignUserId: string,
    timeoutMs = 10_000,
): Promise<boolean> {
    const cfg = env();
    if (!cfg) return false;
    try {
        await call(
            `/projects/${cfg.projectId}/addresses`,
            {
                method: "POST",
                body: JSON.stringify({address, description, foreign_user_id: foreignUserId}),
                timeoutMs,
            },
        );
        return true;
    } catch (e) {
        // 409-ish "already registered" is fine — we treat it as success.
        if (e instanceof Error && /already|exists|duplicate/i.test(e.message)) return true;
        return false;
    }
}

/// List compliance reports for a given country + period (YYYY-MM).
export async function wavynodeListReports(
    countryCode: "MX" | "CO" | "SV" | "GT",
    period: string,
    timeoutMs = 10_000,
): Promise<WavyReport[]> {
    const cfg = env();
    if (!cfg) return [];
    try {
        const qs = new URLSearchParams({
            projectId: cfg.projectId,
            period,
            countryCode,
        }).toString();
        const data = await call<WavyReport[] | {reports?: WavyReport[]}>(`/reports?${qs}`, {
            method: "GET",
            timeoutMs,
        });
        if (Array.isArray(data)) return data;
        return data.reports ?? [];
    } catch {
        return [];
    }
}

/// Get a signed download URL for a specific report.
export async function wavynodeGetReportDownload(reportId: string, timeoutMs = 10_000): Promise<WavyReportDownload | null> {
    const cfg = env();
    if (!cfg) return null;
    try {
        const data = await call<WavyReportDownload>(`/reports/${reportId}`, {method: "GET", timeoutMs});
        return data;
    } catch {
        return null;
    }
}

/// True if the address is flagged: explicit suspicious activity, OR
/// riskScore >= 60 (medium/high/critical bucket per the docs).
export function isWavyFlagged(r: WavyScanRiskResult | null | undefined): boolean {
    if (!r) return false;
    if (r.suspiciousActivity) return true;
    if (typeof r.riskScore === "number" && r.riskScore >= 60) return true;
    if (r.riskLevel === "high" || r.riskLevel === "critical") return true;
    return false;
}
