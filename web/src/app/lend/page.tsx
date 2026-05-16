"use client";

import {useCallback, useEffect, useState} from "react";
import {useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt} from "wagmi";

import {erc20Abi, FAUCET_MAX_MICRO, getContracts, isDeployed, lendingPoolAbi, mockUsdcAbi} from "@/lib/contracts";
import {useChainId} from "wagmi";
import {WrongChainNotice} from "@/components/WrongChainNotice";
import {chainLabel, explorerUrl, formatUsdc, parseUsdc, shortAddress} from "@/lib/format";
import {usePoolHistory, type PoolHistoryEntry} from "@/hooks/usePoolHistory";

export default function LendPage() {
    const {address, isConnected} = useAccount();
    const chainId = useChainId();
    const contracts = getContracts(chainId);
    const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
    const [amount, setAmount] = useState("");
    const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

    const deployed = isDeployed(contracts.lendingPool);

    const {data: tvl, refetch: refetchTvl} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "totalAssets",
        query: {enabled: deployed},
    });

    const {data: shares, refetch: refetchShares} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: deployed && !!address},
    });

    const {data: shareValue, refetch: refetchShareValue} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "convertToAssets",
        args: shares ? [shares] : undefined,
        query: {enabled: deployed && !!shares},
    });

    const {data: usdcBalance, refetch: refetchUsdcBalance} = useReadContract({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: isDeployed(contracts.usdc) && !!address},
    });

    const {data: allowance, refetch: refetchAllowance} = useReadContract({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: address ? [address, contracts.lendingPool] : undefined,
        query: {enabled: isDeployed(contracts.usdc) && !!address},
    });

    const refetchAll = useCallback(() => {
        refetchTvl();
        refetchShares();
        refetchShareValue();
        refetchUsdcBalance();
        refetchAllowance();
    }, [refetchTvl, refetchShares, refetchShareValue, refetchUsdcBalance, refetchAllowance]);

    const {writeContract, isPending} = useWriteContract();
    const {isLoading: isMining, isSuccess} = useWaitForTransactionReceipt({hash: txHash});

    // Auto-refetch all reads when a deposit/withdraw tx lands.
    useEffect(() => {
        if (isSuccess) refetchAll();
    }, [isSuccess, refetchAll]);

    if (!isConnected) return <ConnectNotice />;
    if (!deployed) return <WrongChainNotice />;

    const parsed = safeParse(amount);
    const needsApproval = mode === "deposit" && parsed != null && (allowance ?? 0n) < parsed;

    const onSubmit = () => {
        if (parsed == null || !address) return;
        if (mode === "deposit" && needsApproval) {
            writeContract(
                {
                    address: contracts.usdc,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [contracts.lendingPool, parsed],
                },
                {onSuccess: (hash) => setTxHash(hash)},
            );
            return;
        }
        if (mode === "deposit") {
            writeContract(
                {
                    address: contracts.lendingPool,
                    abi: lendingPoolAbi,
                    functionName: "deposit",
                    args: [parsed, address],
                },
                {onSuccess: (hash) => setTxHash(hash)},
            );
        } else {
            writeContract(
                {
                    address: contracts.lendingPool,
                    abi: lendingPoolAbi,
                    functionName: "withdraw",
                    args: [parsed, address, address],
                },
                {onSuccess: (hash) => setTxHash(hash)},
            );
        }
    };

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <h1 className="text-3xl font-semibold tracking-tight">Lend USDC</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Depositá USDC en el pool y recibí shares (avUSDC). El yield viene de las fees que pagan los borrowers.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <Stat label="TVL del pool" value={`$${formatUsdc(tvl as bigint | undefined)} USDC`} />
                <Stat label="Tus shares" value={formatUsdc(shares as bigint | undefined)} suffix="avUSDC" />
                <Stat label="Valor de tus shares" value={`$${formatUsdc(shareValue as bigint | undefined)} USDC`} />
            </div>

            <FaucetBanner
                usdcBalance={usdcBalance as bigint | undefined}
                usdcAddress={contracts.usdc}
                chainId={chainId}
                onMinted={refetchAll}
            />


            <div className="mt-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex gap-2">
                    <Tab active={mode === "deposit"} onClick={() => setMode("deposit")}>
                        Depositar
                    </Tab>
                    <Tab active={mode === "withdraw"} onClick={() => setMode("withdraw")}>
                        Retirar
                    </Tab>
                </div>

                <div className="mt-6">
                    <label className="text-sm text-zinc-500">Monto (USDC)</label>
                    <div className="mt-1 flex gap-2">
                        <input
                            type="number"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-black"
                        />
                        {mode === "withdraw" && (shareValue as bigint | undefined) && (shareValue as bigint) > 0n && (
                            <button
                                type="button"
                                onClick={() => setAmount(formatUsdc(shareValue as bigint))}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:hover:bg-zinc-800"
                            >
                                Max
                            </button>
                        )}
                        <button
                            disabled={parsed == null || isPending || isMining}
                            onClick={onSubmit}
                            className="rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-40"
                        >
                            {isPending || isMining
                                ? "..."
                                : mode === "deposit"
                                  ? needsApproval
                                      ? "Approve"
                                      : "Depositar"
                                  : "Retirar"}
                        </button>
                    </div>
                    {mode === "deposit" && (
                        <p className="mt-2 text-xs text-zinc-500">
                            Wallet: ${formatUsdc(usdcBalance as bigint | undefined)} USDC disponibles.
                        </p>
                    )}
                    {mode === "withdraw" && (
                        <p className="mt-2 text-xs text-zinc-500">
                            Disponible para retirar: ${formatUsdc(shareValue as bigint | undefined)} USDC (incluye yield acumulado).
                        </p>
                    )}
                    {isSuccess && txHash && (
                        <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                            ✓ Transacción confirmada.{" "}
                            {explorerUrl(chainId, txHash, "tx") && (
                                <a
                                    href={explorerUrl(chainId, txHash, "tx")!}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                >
                                    Ver tx ↗
                                </a>
                            )}
                        </p>
                    )}
                </div>
            </div>

            <PoolHistory
                pool={contracts.lendingPool}
                wallet={address}
                chainId={chainId}
                refetchKey={txHash}
            />
        </main>
    );
}

// ───── Pool history (Deposit + Withdraw events read on-chain) ─────

function PoolHistory({
    pool,
    wallet,
    chainId,
    refetchKey,
}: {
    pool: `0x${string}`;
    wallet: `0x${string}` | undefined;
    chainId: number;
    refetchKey: unknown;
}) {
    const {entries, loading, error} = usePoolHistory(
        isDeployed(pool) ? pool : undefined,
        wallet,
        chainId,
        refetchKey,
    );
    if (!wallet) return null;

    return (
        <section className="mt-10">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">Tu historial en el pool</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                        Cada depósito y retiro leído directo on-chain desde los eventos del LendingPool en {chainLabel(chainId)}.
                    </p>
                </div>
            </div>

            {loading && entries.length === 0 && (
                <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                    Cargando historial on-chain…
                </div>
            )}
            {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                    Error leyendo eventos: {error}
                </div>
            )}
            {!loading && entries.length === 0 && !error && (
                <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                    Todavía no tenés depósitos ni retiros en este pool. Empezá depositando arriba.
                </div>
            )}
            {entries.length > 0 && (
                <ul className="mt-4 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
                    {entries.map((e) => (
                        <PoolHistoryRow key={`${e.txHash}-${e.kind}`} entry={e} chainId={chainId} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function PoolHistoryRow({entry, chainId}: {entry: PoolHistoryEntry; chainId: number}) {
    const isDeposit = entry.kind === "deposit";
    const url = explorerUrl(chainId, entry.txHash, "tx");
    const when = entry.timestamp ? new Date(entry.timestamp * 1000) : null;
    const whenLabel = when
        ? `${when.toLocaleDateString("es-AR", {day: "2-digit", month: "short"})} · ${when.toLocaleTimeString("es-AR", {hour: "2-digit", minute: "2-digit"})}`
        : `block ${entry.blockNumber.toString()}`;
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
                <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                        isDeposit
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                    }`}
                    aria-hidden
                >
                    {isDeposit ? "↓" : "↑"}
                </span>
                <div>
                    <div className="text-sm font-medium">
                        {isDeposit ? "Depósito" : "Retiro"} · ${formatUsdc(entry.assets)} USDC
                    </div>
                    <div className="text-xs text-zinc-500">
                        {whenLabel} · {formatUsdc(entry.shares)} avUSDC
                    </div>
                </div>
            </div>
            {url && (
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                    {shortAddress(entry.txHash)} ↗
                </a>
            )}
        </li>
    );
}

function FaucetBanner({
    usdcBalance,
    usdcAddress,
    chainId,
    onMinted,
}: {
    usdcBalance: bigint | undefined;
    usdcAddress: `0x${string}`;
    chainId: number;
    onMinted: () => void;
}) {
    const {writeContract, isPending, data: hash} = useWriteContract();
    const {isLoading: mining, isSuccess} = useWaitForTransactionReceipt({hash});

    // Refetch parent state when the faucet tx confirms.
    useEffect(() => {
        if (isSuccess) onMinted();
    }, [isSuccess, onMinted]);
    const onFaucet = () =>
        writeContract({
            address: usdcAddress,
            abi: mockUsdcAbi,
            functionName: "faucet",
            args: [FAUCET_MAX_MICRO],
        });
    const txUrl = hash ? explorerUrl(chainId, hash, "tx") : null;
    return (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="text-sm font-medium">Faucet de prueba · {chainLabel(chainId)}</div>
                <div className="text-xs text-zinc-500">
                    Tu wallet tiene ${formatUsdc(usdcBalance)} mUSDC. Tirá faucet para mintear 10k y depositar.
                    {isSuccess && txUrl && (
                        <>
                            {" · "}
                            <a href={txUrl} target="_blank" rel="noreferrer" className="underline">
                                Ver tx ↗
                            </a>
                        </>
                    )}
                </div>
            </div>
            <button
                onClick={onFaucet}
                disabled={isPending || mining}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-black dark:hover:bg-zinc-800"
            >
                {isPending || mining ? "Procesando…" : isSuccess ? "✓ 10k recibidos" : "Mintear 10k mUSDC"}
            </button>
        </div>
    );
}

function safeParse(s: string): bigint | null {
    if (!s) return null;
    try {
        const v = parseUsdc(s);
        return v > 0n ? v : null;
    } catch {
        return null;
    }
}

function Stat({label, value, suffix}: {label: string; value: string; suffix?: string}) {
    return (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="mt-1 text-xl font-semibold">
                {value}
                {suffix && <span className="ml-1 text-sm font-normal text-zinc-500">{suffix}</span>}
            </div>
        </div>
    );
}

function Tab({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
    return (
        <button
            onClick={onClick}
            className={
                active
                    ? "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
                    : "rounded-lg px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }
        >
            {children}
        </button>
    );
}

function ConnectNotice() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h1 className="text-2xl font-semibold">Conectá tu wallet</h1>
            <p className="mt-3 text-zinc-500">Usá el botón arriba a la derecha para empezar.</p>
        </main>
    );
}
