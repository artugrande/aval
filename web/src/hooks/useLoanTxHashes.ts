"use client";

import {useEffect, useState} from "react";
import {parseAbiItem, type Address, type Hex} from "viem";
import {usePublicClient} from "wagmi";

/**
 * Reads CreditManager.LoanOpened events for a borrower and returns a map of
 * loanId → opening-tx hash, so the LoanCard can link to the explorer. We do
 * this via getLogs (no off-chain indexer) — works on any EVM RPC.
 */

const LOAN_OPENED = parseAbiItem(
    "event LoanOpened(uint256 indexed loanId, address indexed borrower, uint256 principal, uint16 tenorDays, uint16 feeBps, bytes32 scoreId)",
);

export function useLoanTxHashes(
    creditManager: Address | undefined,
    borrower: Address | undefined,
    chainId: number | undefined,
    refetchKey?: unknown,
): Map<bigint, Hex> {
    const client = usePublicClient({chainId});
    const [map, setMap] = useState<Map<bigint, Hex>>(() => new Map());

    useEffect(() => {
        if (!creditManager || !borrower || !client) {
            setMap(new Map());
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const logs = await client.getLogs({
                    address: creditManager,
                    event: LOAN_OPENED,
                    args: {borrower},
                    fromBlock: "earliest",
                    toBlock: "latest",
                });
                if (cancelled) return;
                const next = new Map<bigint, Hex>();
                for (const l of logs) {
                    const id = l.args.loanId as bigint | undefined;
                    if (id != null && l.transactionHash) next.set(id, l.transactionHash);
                }
                setMap(next);
            } catch {
                if (!cancelled) setMap(new Map());
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [creditManager, borrower, client, refetchKey]);

    return map;
}
