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
