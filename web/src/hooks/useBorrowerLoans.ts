"use client";

import {useMemo} from "react";
import type {Address} from "viem";
import {useReadContract, useReadContracts} from "wagmi";

import {contracts, creditManagerAbi, type Loan} from "@/lib/contracts";

/**
 * Reads all loans on the CreditManager and returns just those belonging to `wallet`.
 *
 * Implementation: O(N) where N = total loans across all borrowers (cheap until we
 * outgrow demo scale). One `multicall` batches all `loans(i)` reads. For a real
 * production deployment we'd index `LoanOpened(borrower indexed)` events with a
 * subgraph or Supabase trigger instead.
 */
export function useBorrowerLoans(wallet: Address | undefined) {
    const {
        data: nextLoanId,
        refetch: refetchNextId,
        isLoading: nextIdLoading,
    } = useReadContract({
        address: contracts.creditManager,
        abi: creditManagerAbi,
        functionName: "nextLoanId",
        query: {enabled: !!wallet},
    });

    const loanIds = useMemo<bigint[]>(() => {
        if (!nextLoanId || nextLoanId === 0n) return [];
        const ids: bigint[] = [];
        for (let i = 1n; i <= (nextLoanId as bigint); i++) ids.push(i);
        return ids;
    }, [nextLoanId]);

    const {
        data: rawLoans,
        refetch: refetchAll,
        isLoading: loansLoading,
    } = useReadContracts({
        contracts: loanIds.map((id) => ({
            address: contracts.creditManager,
            abi: creditManagerAbi,
            functionName: "loans" as const,
            args: [id] as const,
        })),
        query: {enabled: loanIds.length > 0 && !!wallet},
    });

    const loans = useMemo<Loan[]>(() => {
        if (!rawLoans || !wallet) return [];
        const w = wallet.toLowerCase();
        const result: Loan[] = [];
        for (let i = 0; i < rawLoans.length; i++) {
            const entry = rawLoans[i];
            if (entry.status !== "success") continue;
            const tuple = entry.result as readonly [
                `0x${string}`,
                bigint,
                number,
                bigint,
                bigint,
                boolean,
                boolean,
            ];
            const [borrower, principal, feeBps, startedAt, maturityAt, repaid, defaulted] = tuple;
            if (borrower.toLowerCase() !== w) continue;
            result.push({
                loanId: loanIds[i],
                borrower,
                principal,
                feeBps,
                startedAt,
                maturityAt,
                repaid,
                defaulted,
            });
        }
        // Newest first
        return result.sort((a, b) => Number(b.loanId - a.loanId));
    }, [rawLoans, loanIds, wallet]);

    const refetch = () => {
        refetchNextId();
        refetchAll();
    };

    return {loans, isLoading: nextIdLoading || loansLoading, refetch};
}
