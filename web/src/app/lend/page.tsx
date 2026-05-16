"use client";

import {useState} from "react";
import {useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt} from "wagmi";

import {contracts, erc20Abi, FAUCET_MAX_MICRO, isDeployed, lendingPoolAbi, mockUsdcAbi} from "@/lib/contracts";
import {formatUsdc, parseUsdc, snowtraceUrl} from "@/lib/format";

export default function LendPage() {
    const {address, isConnected} = useAccount();
    const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
    const [amount, setAmount] = useState("");
    const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

    const deployed = isDeployed(contracts.lendingPool);

    const {data: tvl} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "totalAssets",
        query: {enabled: deployed},
    });

    const {data: shares} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: deployed && !!address},
    });

    const {data: shareValue} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "convertToAssets",
        args: shares ? [shares] : undefined,
        query: {enabled: deployed && !!shares},
    });

    const {data: usdcBalance} = useReadContract({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: {enabled: isDeployed(contracts.usdc) && !!address},
    });

    const {data: allowance} = useReadContract({
        address: contracts.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: address ? [address, contracts.lendingPool] : undefined,
        query: {enabled: isDeployed(contracts.usdc) && !!address},
    });

    const {writeContract, isPending} = useWriteContract();
    const {isLoading: isMining, isSuccess} = useWaitForTransactionReceipt({hash: txHash});

    if (!deployed) return <NotDeployedNotice />;
    if (!isConnected) return <ConnectNotice />;

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

            <FaucetBanner usdcBalance={usdcBalance as bigint | undefined} />


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
                    {isSuccess && txHash && (
                        <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                            ✓ Transacción confirmada.{" "}
                            <a href={snowtraceUrl(txHash, "tx")} target="_blank" rel="noreferrer" className="underline">
                                Ver tx
                            </a>{" "}
                            · Actualizá para ver el balance nuevo.
                        </p>
                    )}
                </div>
            </div>
        </main>
    );
}

function FaucetBanner({usdcBalance}: {usdcBalance: bigint | undefined}) {
    const {writeContract, isPending, data: hash} = useWriteContract();
    const {isLoading: mining, isSuccess} = useWaitForTransactionReceipt({hash});
    const onFaucet = () =>
        writeContract({
            address: contracts.usdc,
            abi: mockUsdcAbi,
            functionName: "faucet",
            args: [FAUCET_MAX_MICRO],
        });
    return (
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="text-sm font-medium">Faucet de prueba (Fuji testnet)</div>
                <div className="text-xs text-zinc-500">
                    Tu wallet tiene ${formatUsdc(usdcBalance)} mUSDC. Tirá faucet para mintear 10k y depositar.
                    {isSuccess && hash && (
                        <>
                            {" · "}
                            <a href={snowtraceUrl(hash, "tx")} target="_blank" rel="noreferrer" className="underline">
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

function NotDeployedNotice() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h1 className="text-2xl font-semibold">Aún no desplegado en Fuji</h1>
            <p className="mt-3 text-zinc-500">
                Corré <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">forge script</code> y
                pegá las addresses en <code>web/.env.local</code>.
            </p>
        </main>
    );
}

function ConnectNotice() {
    return (
        <main className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h1 className="text-2xl font-semibold">Conectá tu wallet</h1>
            <p className="mt-3 text-zinc-500">Usá el botón arriba a la derecha. Aval funciona en Avalanche Fuji.</p>
        </main>
    );
}
