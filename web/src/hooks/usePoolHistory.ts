"use client";

import {useEffect, useState} from "react";
import {parseAbiItem, type Address, type Hex} from "viem";
import {usePublicClient} from "wagmi";

/**
 * Reads the wallet's Deposit + Withdraw history from the ERC4626 LendingPool
 * directly via `getLogs` — no off-chain indexer needed.
 *
 * Returns the most recent first. Refetches when `refetchKey` changes (eg. when
 * a deposit/withdraw tx confirms upstream).
 */

const DEPOSIT_EVENT = parseAbiItem(
    "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);
const WITHDRAW_EVENT = parseAbiItem(
    "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);

export interface PoolHistoryEntry {
    kind: "deposit" | "withdraw";
    assets: bigint; // micro-USDC
    shares: bigint;
    txHash: Hex;
    blockNumber: bigint;
    timestamp: number | null; // unix seconds; null until enriched
}

export interface UsePoolHistory {
    entries: PoolHistoryEntry[];
    loading: boolean;
    error: string | null;
}

export function usePoolHistory(
    pool: Address | undefined,
    wallet: Address | undefined,
    chainId: number | undefined,
    refetchKey?: unknown,
): UsePoolHistory {
    const client = usePublicClient({chainId});
    const [entries, setEntries] = useState<PoolHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!pool || !wallet || !client) {
            setEntries([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);

        (async () => {
            try {
                const [depositLogs, withdrawLogs] = await Promise.all([
                    client.getLogs({
                        address: pool,
                        event: DEPOSIT_EVENT,
                        args: {owner: wallet},
                        fromBlock: "earliest",
                        toBlock: "latest",
                    }),
                    client.getLogs({
                        address: pool,
                        event: WITHDRAW_EVENT,
                        args: {owner: wallet},
                        fromBlock: "earliest",
                        toBlock: "latest",
                    }),
                ]);

                const raw: PoolHistoryEntry[] = [
                    ...depositLogs.map((l) => ({
                        kind: "deposit" as const,
                        assets: (l.args.assets as bigint | undefined) ?? 0n,
                        shares: (l.args.shares as bigint | undefined) ?? 0n,
                        txHash: l.transactionHash!,
                        blockNumber: l.blockNumber!,
                        timestamp: null as number | null,
                    })),
                    ...withdrawLogs.map((l) => ({
                        kind: "withdraw" as const,
                        assets: (l.args.assets as bigint | undefined) ?? 0n,
                        shares: (l.args.shares as bigint | undefined) ?? 0n,
                        txHash: l.transactionHash!,
                        blockNumber: l.blockNumber!,
                        timestamp: null as number | null,
                    })),
                ];

                // Newest first
                raw.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));

                if (cancelled) return;
                setEntries(raw);

                // Enrich with block timestamps in parallel — cap to the 20 most recent to
                // keep latency low. Older entries fall back to "—".
                const uniqueBlocks = Array.from(new Set(raw.slice(0, 20).map((e) => e.blockNumber)));
                const blockMap = new Map<bigint, number>();
                await Promise.all(
                    uniqueBlocks.map(async (bn) => {
                        try {
                            const b = await client.getBlock({blockNumber: bn});
                            blockMap.set(bn, Number(b.timestamp));
                        } catch {
                            /* skip */
                        }
                    }),
                );
                if (cancelled) return;
                setEntries((prev) =>
                    prev.map((e) =>
                        blockMap.has(e.blockNumber) ? {...e, timestamp: blockMap.get(e.blockNumber)!} : e,
                    ),
                );
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "history_failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pool, wallet, client, refetchKey]);

    return {entries, loading, error};
}
