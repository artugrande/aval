"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {useReadContract, useReadContracts} from "wagmi";
import {avalancheFuji} from "wagmi/chains";

import {creditManagerAbi, getContracts, lendingPoolAbi} from "@/lib/contracts";

/**
 * Live pool metrics for the lender section. Reads Avalanche Fuji (the public
 * deployment) so visitors see the same numbers without connecting a wallet.
 * Animates count-up the first time the component is on-screen.
 */
export function PoolMetrics() {
    const contracts = getContracts(avalancheFuji.id);
    const rootRef = useRef<HTMLDivElement>(null);
    const yieldRef = useRef<HTMLDivElement>(null);
    const repaidRef = useRef<HTMLDivElement>(null);
    const defaultedRef = useRef<HTMLDivElement>(null);
    const rateRef = useRef<HTMLDivElement>(null);
    const [animated, setAnimated] = useState(false);

    // 1 share = 1e6 of underlying at genesis; deviation = realized yield.
    const {data: oneShareAssets} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "convertToAssets",
        args: [1_000_000n],
        chainId: avalancheFuji.id,
    });

    const {data: nextLoanId} = useReadContract({
        address: contracts.creditManager,
        abi: creditManagerAbi,
        functionName: "nextLoanId",
        chainId: avalancheFuji.id,
    });

    const loanIds = useMemo<bigint[]>(() => {
        const next = (nextLoanId as bigint | undefined) ?? 0n;
        if (next === 0n) return [];
        const ids: bigint[] = [];
        for (let i = 1n; i <= next; i++) ids.push(i);
        return ids;
    }, [nextLoanId]);

    const {data: loansData} = useReadContracts({
        contracts: loanIds.map(
            (id) =>
                ({
                    address: contracts.creditManager,
                    abi: creditManagerAbi,
                    functionName: "loans" as const,
                    args: [id] as const,
                    chainId: avalancheFuji.id,
                }) as const,
        ),
        query: {enabled: loanIds.length > 0},
    });

    const metrics = useMemo(() => {
        // Yield = (1 share / 1 USDC) - 1, in basis points
        const yieldBps = oneShareAssets ? Number(((oneShareAssets as bigint) - 1_000_000n) * 10_000n) / 1_000_000 : 0;
        const yieldPct = Math.max(0, yieldBps / 100); // bps → %

        let repaid = 0;
        let defaulted = 0;
        if (loansData) {
            for (const r of loansData) {
                if (r.status !== "success") continue;
                const tuple = r.result as readonly [`0x${string}`, bigint, number, bigint, bigint, boolean, boolean];
                if (tuple[5]) repaid++;
                if (tuple[6]) defaulted++;
            }
        }
        const closed = repaid + defaulted;
        const rate = closed > 0 ? (repaid / closed) * 100 : 100;
        return {yieldPct, repaid, defaulted, rate};
    }, [oneShareAssets, loansData]);

    // Animate count-up when the section enters the viewport (once)
    useEffect(() => {
        if (animated) return;
        const el = rootRef.current;
        if (!el) return;

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    animateCounter(yieldRef.current, 0, metrics.yieldPct, (v) => `+${v.toFixed(2)}%`);
                    animateCounter(repaidRef.current, 0, metrics.repaid, (v) => Math.round(v).toString());
                    animateCounter(defaultedRef.current, 0, metrics.defaulted, (v) => Math.round(v).toString());
                    animateCounter(rateRef.current, 0, metrics.rate, (v) => `${Math.round(v)}%`);
                    setAnimated(true);
                    io.disconnect();
                });
            },
            {threshold: 0.4},
        );
        io.observe(el);
        return () => io.disconnect();
    }, [animated, metrics]);

    return (
        <div ref={rootRef} className="pool-metrics">
            <div className="pool-metric">
                <div className="pool-metric-v mono accent" ref={yieldRef}>
                    +0.00%
                </div>
                <div className="pool-metric-l">Yield acumulado</div>
            </div>
            <div className="pool-metric">
                <div className="pool-metric-v mono" ref={repaidRef}>
                    0
                </div>
                <div className="pool-metric-l">Préstamos pagados</div>
            </div>
            <div className="pool-metric">
                <div className="pool-metric-v mono" ref={defaultedRef}>
                    0
                </div>
                <div className="pool-metric-l">Sin pagar</div>
            </div>
            <div className="pool-metric">
                <div className="pool-metric-v mono accent" ref={rateRef}>
                    100%
                </div>
                <div className="pool-metric-l">Tasa de pago</div>
            </div>
            <div className="pool-metric-foot">Pool de Avalanche Fuji · datos on-chain en vivo</div>
        </div>
    );
}

function animateCounter(el: HTMLElement | null, from: number, to: number, fmt: (v: number) => string) {
    if (!el) return;
    const dur = 1600;
    const t0 = performance.now();
    const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(from + (to - from) * eased);
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
