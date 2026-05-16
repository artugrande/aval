"use client";

import {useEffect, useState} from "react";
import {keccak256, stringToBytes, type Address, type Hex} from "viem";
import {useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {avalancheFuji} from "wagmi/chains";

import {
    creditManagerAbi,
    erc20Abi,
    feeBpsForLevel,
    formatPercentage,
    getContracts,
    isDeployed,
    type Loan,
    loanStatus,
    loanTotalDue,
} from "@/lib/contracts";
import {useChainId} from "wagmi";
import {formatUsdc, parseUsdc, snowtraceUrl} from "@/lib/format";
import {kybSubmit, scoreAttest, type AttestationResponse, type KybSubmitResponse} from "@/lib/api";
import {useBorrowerLoans} from "@/hooks/useBorrowerLoans";

export default function BorrowPage() {
    const {address, isConnected} = useAccount();
    const chainId = useChainId();
    const contracts = getContracts(chainId);
    const [kyb, setKyb] = useState<KybSubmitResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Auto-verify on wallet connection. KYB is just provisioning a profile —
    // identity is the wallet address.
    useEffect(() => {
        if (!isConnected || !address || kyb) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        kybSubmit({
            wallet: address,
            taxIdHash: keccak256(stringToBytes(`anon:${address.toLowerCase()}`)),
            countryCode: "MX",
            legalName: undefined,
            sector: undefined,
        })
            .then((res) => {
                if (!cancelled) setKyb(res);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "verify_failed");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isConnected, address, kyb]);

    const refreshKyb = () => setKyb(null);

    if (!isDeployed(contracts.creditManager))
        return <Notice title="Aún no desplegado" body="Corré forge script y pegá las addresses en web/.env.local." />;
    if (!isConnected) return <Notice title="Conectá tu wallet" body="Aval funciona en Avalanche Fuji." />;

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <h1 className="text-3xl font-semibold tracking-tight">Solicitar crédito</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Tu cap arranca en L1 ($100) y crece automáticamente con cada préstamo repagado a tiempo. Tu wallet es
                tu identidad.
            </p>

            {error && (
                <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                    {error}
                </div>
            )}

            {loading || !kyb ? (
                <SkeletonCard />
            ) : (
                <BorrowForm wallet={address!} kyb={kyb} onError={setError} onRefresh={refreshKyb} />
            )}
        </main>
    );
}

// ---------- Borrow form ----------

function BorrowForm({
    wallet,
    kyb,
    onError,
    onRefresh,
}: {
    wallet: Address;
    kyb: KybSubmitResponse;
    onError: (e: string) => void;
    onRefresh: () => void;
}) {
    const chainId = useChainId();
    const contracts = getContracts(chainId);
    const [amount, setAmount] = useState("");
    const [tenor, setTenor] = useState(30);
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState<Hex | undefined>();

    // Protocol-determined fee, computed from the borrower's level.
    const feeBps = feeBpsForLevel(kyb.bootstrap.level);

    const {data: outstanding, refetch: refetchOutstanding} = useReadContract({
        address: contracts.creditManager,
        abi: creditManagerAbi,
        functionName: "outstanding",
        args: [wallet],
    });

    const {loans, refetch: refetchLoans} = useBorrowerLoans(wallet);

    const {writeContractAsync} = useWriteContract();
    const {isLoading: mining, isSuccess} = useWaitForTransactionReceipt({hash: txHash});

    // After a borrow lands, refetch loans + outstanding.
    useEffect(() => {
        if (isSuccess) {
            refetchLoans();
            refetchOutstanding();
        }
    }, [isSuccess, refetchLoans, refetchOutstanding]);

    const onLoanRepaid = () => {
        refetchLoans();
        refetchOutstanding();
        onRefresh(); // triggers kyb refetch — cap moves up a level
    };

    const parsed = safeParseAmount(amount);
    const capMicro = BigInt(kyb.maxCapMicro);
    const exceeds = parsed != null && ((outstanding as bigint | undefined) ?? 0n) + parsed > capMicro;

    const submit = async () => {
        if (parsed == null) return;
        setBusy(true);
        try {
            const att: AttestationResponse = await scoreAttest({wallet, chainId: avalancheFuji.id});
            const hash = await writeContractAsync({
                address: contracts.creditManager,
                abi: creditManagerAbi,
                functionName: "borrowWithTerm",
                args: [
                    parsed,
                    tenor,
                    feeBps,
                    {
                        borrower: att.attestation.borrower,
                        maxCap: BigInt(att.attestation.maxCap),
                        expiresAt: BigInt(att.attestation.expiresAt),
                        nonce: BigInt(att.attestation.nonce),
                        scoreId: att.attestation.scoreId,
                    },
                    att.signature,
                ],
            });
            setTxHash(hash);
        } catch (err) {
            onError(err instanceof Error ? err.message : "borrow_failed");
        } finally {
            setBusy(false);
        }
    };

    const maxLevel = kyb.bootstrap.maxLevel ?? 11;
    const progressPct = Math.round((kyb.bootstrap.level / maxLevel) * 100);

    return (
        <div className="mt-8 space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-bold text-background">
                                L{kyb.bootstrap.level}
                            </span>
                            <span className="text-xs uppercase tracking-wider text-zinc-500">Tu línea de crédito</span>
                        </div>
                        <div className="mt-2 text-3xl font-semibold">${kyb.maxCapUsd.toLocaleString("en-US")} USDC</div>
                        <div className="mt-1 text-xs text-zinc-500">
                            {kyb.bootstrap.repaidCount} préstamo{kyb.bootstrap.repaidCount === 1 ? "" : "s"} repagado
                            {kyb.bootstrap.repaidCount === 1 ? "" : "s"} · Score {kyb.score} / 1000
                        </div>
                    </div>
                    <button onClick={onRefresh} className="text-sm text-zinc-500 hover:underline">
                        ↻ Refrescar
                    </button>
                </div>

                <div className="mt-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div className="h-full bg-foreground transition-all" style={{width: `${progressPct}%`}} />
                    </div>
                    {kyb.bootstrap.nextLevelCapUsd != null ? (
                        <p className="mt-2 text-xs text-zinc-500">
                            Repagá 1 préstamo más a tiempo → L{kyb.bootstrap.level + 1}: cap sube a $
                            {kyb.bootstrap.nextLevelCapUsd.toLocaleString("en-US")} USDC.
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-zinc-500">Nivel máximo alcanzado. 🎉</p>
                    )}
                </div>

                <div className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-500 dark:border-zinc-900">
                    En uso ahora: ${formatUsdc(outstanding as bigint | undefined)} USDC
                </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Monto (USDC)">
                        <input
                            type="number"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="500"
                            className="input"
                        />
                    </Field>
                    <Field label="Plazo (días)">
                        <input
                            type="number"
                            min={1}
                            max={365}
                            value={tenor}
                            onChange={(e) => setTenor(Number(e.target.value))}
                            className="input"
                        />
                    </Field>
                </div>

                <div className="mt-4 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
                    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                        <span className="text-zinc-500">Tasa del protocolo (L{kyb.bootstrap.level})</span>
                        <span className="font-semibold">{formatPercentage(feeBps)}</span>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end sm:gap-2">
                        <span className="text-zinc-500">A repagar</span>
                        <span className="font-semibold">
                            ${parsed ? formatUsdc(parsed + (parsed * BigInt(feeBps)) / 10_000n) : "—"} USDC
                        </span>
                    </div>
                </div>
                <button
                    onClick={submit}
                    disabled={busy || mining || parsed == null || exceeds}
                    className="mt-6 rounded-lg bg-foreground px-5 py-2.5 font-medium text-background disabled:opacity-40"
                >
                    {busy
                        ? "Firmando attestation…"
                        : mining
                          ? "Confirmando…"
                          : exceeds
                            ? "Excede tu cap"
                            : "Pedir préstamo"}
                </button>
                {isSuccess && txHash && (
                    <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                        ✓ Préstamo abierto on-chain.{" "}
                        <a
                            href={snowtraceUrl(txHash, "tx")}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                        >
                            Ver tx
                        </a>
                    </p>
                )}
            </div>

            <LoanList wallet={wallet} loans={loans} onLoanRepaid={onLoanRepaid} onError={onError} />
        </div>
    );
}

function LoanList({
    wallet,
    loans,
    onLoanRepaid,
    onError,
}: {
    wallet: Address;
    loans: Loan[];
    onLoanRepaid: () => void;
    onError: (e: string) => void;
}) {
    if (loans.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Tus préstamos</h2>
                <p className="mt-2 text-sm text-zinc-500">
                    Todavía no tenés préstamos abiertos. Pedí uno arriba para empezar a construir nivel.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Tus préstamos</h2>
            {loans.map((loan) => (
                <LoanCard key={loan.loanId.toString()} loan={loan} wallet={wallet} onRepaid={onLoanRepaid} onError={onError} />
            ))}
        </div>
    );
}

function LoanCard({
    loan,
    wallet,
    onRepaid,
    onError,
}: {
    loan: Loan;
    wallet: Address;
    onRepaid: () => void;
    onError: (e: string) => void;
}) {
    const chainId = useChainId();
    const contracts = getContracts(chainId);
    const status = loanStatus(loan);
    const total = loanTotalDue(loan);
    const fee = total - loan.principal;

    const {data: balance, refetch: refetchBalance} = useReadContract({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet],
        query: {enabled: status === "active" || status === "overdue"},
    });
    const {data: allowance, refetch: refetchAllowance} = useReadContract({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet, contracts.creditManager],
        query: {enabled: status === "active" || status === "overdue"},
    });

    const {writeContract, isPending, data: hash, reset} = useWriteContract();
    const {isLoading: mining, isSuccess} = useWaitForTransactionReceipt({hash});

    const needsApproval = (allowance as bigint | undefined ?? 0n) < total;
    const hasFunds = (balance as bigint | undefined ?? 0n) >= total;
    const shortfall = total - ((balance as bigint | undefined) ?? 0n);

    useEffect(() => {
        if (!isSuccess || !hash) return;
        refetchBalance();
        refetchAllowance();
        // When the tx was the actual `repay`, propagate up.
        if (!needsApproval) {
            onRepaid();
        }
        reset();
    }, [isSuccess, hash, needsApproval, onRepaid, refetchAllowance, refetchBalance, reset]);

    const doAction = () => {
        try {
            if (needsApproval) {
                writeContract({
                    address: contracts.usdc,
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [contracts.creditManager, total],
                });
            } else {
                writeContract({
                    address: contracts.creditManager,
                    abi: creditManagerAbi,
                    functionName: "repay",
                    args: [loan.loanId],
                });
            }
        } catch (err) {
            onError(err instanceof Error ? err.message : "tx_failed");
        }
    };

    const maturity = new Date(Number(loan.maturityAt) * 1000);
    const daysToMaturity = Math.ceil((maturity.getTime() - Date.now()) / 86_400_000);

    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Préstamo #{loan.loanId.toString()}</span>
                        <StatusBadge status={status} />
                    </div>
                    <div className="mt-2 text-2xl font-semibold">${formatUsdc(loan.principal)} USDC</div>
                    <div className="mt-1 text-xs text-zinc-500">
                        Fee {formatPercentage(loan.feeBps)} = ${formatUsdc(fee)} · A repagar:{" "}
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">${formatUsdc(total)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                        {status === "repaid"
                            ? "Repagado ✓"
                            : status === "defaulted"
                              ? "En default"
                              : status === "overdue"
                                ? `Vencido hace ${-daysToMaturity}d`
                                : `Vence en ${daysToMaturity}d (${maturity.toLocaleDateString()})`}
                    </div>
                </div>
                {(status === "active" || status === "overdue") && (
                    <div className="flex flex-col items-end gap-2">
                        <button
                            onClick={doAction}
                            disabled={isPending || mining || !hasFunds}
                            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
                        >
                            {isPending || mining
                                ? "Procesando…"
                                : !hasFunds
                                  ? "Saldo insuficiente"
                                  : needsApproval
                                    ? "Aprobar mUSDC"
                                    : "Repagar"}
                        </button>
                        {!hasFunds && (
                            <p className="text-right text-xs text-zinc-500">
                                Faltan ${formatUsdc(shortfall)} mUSDC.
                                <br />
                                <a href="/lend" className="underline">
                                    Conseguir en /lend
                                </a>
                            </p>
                        )}
                        {hash && (
                            <a href={snowtraceUrl(hash, "tx")} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 underline">
                                Ver tx ↗
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatusBadge({status}: {status: ReturnType<typeof loanStatus>}) {
    const styles: Record<ReturnType<typeof loanStatus>, string> = {
        active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
        overdue: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
        repaid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
        defaulted: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    };
    const labels = {active: "Activo", overdue: "Vencido", repaid: "Repagado", defaulted: "Default"};
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

// ---------- bits ----------

function SkeletonCard() {
    return (
        <div className="mt-8 animate-pulse rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
                <div className="h-5 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-3 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="mt-4 h-9 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-3 h-3 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-6 h-1.5 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
            <p className="mt-4 text-xs text-zinc-500">Leyendo tu historial on-chain…</p>
        </div>
    );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <label className="block">
            <span className="text-sm text-zinc-500">{label}</span>
            <div className="mt-1">{children}</div>
        </label>
    );
}

function Notice({title, body}: {title: string; body: string}) {
    return (
        <main className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-3 text-zinc-500">{body}</p>
        </main>
    );
}

function safeParseAmount(s: string): bigint | null {
    if (!s) return null;
    try {
        const v = parseUsdc(s);
        return v > 0n ? v : null;
    } catch {
        return null;
    }
}
