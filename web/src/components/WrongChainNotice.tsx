"use client";

import {useSwitchChain} from "wagmi";
import {avalancheFuji} from "wagmi/chains";

import {avalL1} from "@/lib/wagmi-chains";

export function WrongChainNotice() {
    const {switchChain, isPending} = useSwitchChain();
    return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
            <h1 className="text-2xl font-semibold">Aval no opera en esta red</h1>
            <p className="mt-3 text-zinc-500">Switcheá tu wallet a alguna de estas redes para continuar:</p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <ChainButton
                    name="Avalanche Fuji"
                    sub="C-Chain · Testnet pública"
                    onClick={() => switchChain({chainId: avalancheFuji.id})}
                    disabled={isPending}
                />
                <ChainButton
                    name="Aval L1"
                    sub="Nuestra propia subnet"
                    onClick={() => switchChain({chainId: avalL1.id})}
                    disabled={isPending}
                    accent
                />
            </div>

            <p className="mt-6 text-xs text-zinc-400">
                También podés cambiar de red desde el selector de tu wallet directamente.
            </p>
        </main>
    );
}

function ChainButton({
    name,
    sub,
    onClick,
    disabled,
    accent,
}: {
    name: string;
    sub: string;
    onClick: () => void;
    disabled: boolean;
    accent?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-40 ${
                accent
                    ? "border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:hover:bg-red-900"
                    : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            }`}
        >
            <div className="font-semibold">{name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
        </button>
    );
}
