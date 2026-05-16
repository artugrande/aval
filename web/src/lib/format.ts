import {formatUnits, parseUnits} from "viem";

export const USDC_DECIMALS = 6;

export function formatUsdc(micro: bigint | undefined | null, opts: {maxFractionDigits?: number} = {}): string {
    if (micro == null) return "—";
    const raw = formatUnits(micro, USDC_DECIMALS);
    const num = Number(raw);
    return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: opts.maxFractionDigits ?? 2,
    });
}

export function parseUsdc(input: string): bigint {
    return parseUnits(input.trim(), USDC_DECIMALS);
}

export function shortAddress(addr: string | undefined | null): string {
    if (!addr) return "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function snowtraceUrl(addr: string, kind: "address" | "tx" = "address"): string {
    return `https://testnet.snowtrace.io/${kind}/${addr}`;
}

const AVAL_L1_EXPLORER = process.env.NEXT_PUBLIC_AVAL_L1_EXPLORER || "https://explorer-test.avax.network/aval";
const AVAL_L1_CHAIN_ID = Number(process.env.NEXT_PUBLIC_AVAL_L1_CHAIN_ID ?? "0");
const FUJI_CHAIN_ID = 43113;

/** Per-chain explorer URL. Returns null if we don't have one for the chain. */
export function explorerUrl(chainId: number | undefined, value: string, kind: "address" | "tx" = "address"): string | null {
    if (chainId === FUJI_CHAIN_ID) return snowtraceUrl(value, kind);
    if (chainId === AVAL_L1_CHAIN_ID && AVAL_L1_CHAIN_ID > 0) return `${AVAL_L1_EXPLORER}/${kind}/${value}`;
    return null;
}

/** Human-facing label for a chain. Falls back to "Chain {id}". */
export function chainLabel(chainId: number | undefined): string {
    if (chainId === FUJI_CHAIN_ID) return "Avalanche Fuji";
    if (chainId === AVAL_L1_CHAIN_ID && AVAL_L1_CHAIN_ID > 0) return "Aval L1";
    if (chainId == null) return "—";
    return `Chain ${chainId}`;
}
