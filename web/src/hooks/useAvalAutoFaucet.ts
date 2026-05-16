"use client";

import {useEffect, useRef, useState} from "react";
import {useAccount, useBalance} from "wagmi";

import {avalL1} from "@/lib/wagmi-chains";

const MIN_BALANCE_WEI = 5_000_000_000_000_000n; // 0.005 AVL — below this we top up
const SESSION_KEY = "aval-faucet-attempted-v1";

export interface FaucetResult {
    status: "sent" | "skipped" | "rate_limited" | "error";
    txHash?: string;
    amount?: string;
    balance?: string;
    reason?: string;
}

/**
 * Auto-tops-up the connected wallet with 0.02 AVL the first time they hit
 * Aval L1 with under 0.005 AVL. Idempotent: server dedups by wallet, client
 * dedups within the session via sessionStorage so we don't spam the endpoint
 * on every render.
 *
 * Returns the most recent result so a toast/banner can render off it.
 */
export function useAvalAutoFaucet(): FaucetResult | null {
    const {address, isConnected, chainId} = useAccount();
    const {data: balance, refetch} = useBalance({
        address,
        chainId: avalL1.id,
        query: {enabled: !!address && chainId === avalL1.id, refetchInterval: false},
    });
    const [result, setResult] = useState<FaucetResult | null>(null);
    const inflight = useRef(false);

    useEffect(() => {
        if (!isConnected || !address) return;
        if (chainId !== avalL1.id) return; // only intervene on Aval L1
        if (balance === undefined) return; // still loading
        if (balance.value >= MIN_BALANCE_WEI) return; // already funded
        if (inflight.current) return;

        // Already tried this wallet this session? Don't re-call.
        const sessionKey = `${SESSION_KEY}:${address.toLowerCase()}`;
        if (typeof window !== "undefined" && sessionStorage.getItem(sessionKey)) return;

        inflight.current = true;
        (async () => {
            try {
                const res = await fetch("/api/aval-faucet", {
                    method: "POST",
                    headers: {"content-type": "application/json"},
                    body: JSON.stringify({wallet: address}),
                });
                const data = (await res.json()) as FaucetResult;
                setResult(data);
                if (typeof window !== "undefined") sessionStorage.setItem(sessionKey, "1");
                // Refresh balance on success so the user sees the new amount quickly.
                if (data.status === "sent") setTimeout(() => void refetch(), 800);
            } catch (e) {
                setResult({status: "error", reason: e instanceof Error ? e.message : "network_error"});
            } finally {
                inflight.current = false;
            }
        })();
    }, [isConnected, address, chainId, balance, refetch]);

    return result;
}
