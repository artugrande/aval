"use client";

import Link from "next/link";
import {useAccount} from "wagmi";

export default function Home() {
    const {isConnected} = useAccount();

    return (
        <div className="flex flex-col bg-zinc-50 font-sans dark:bg-black">
            <section className="mx-auto max-w-4xl px-6 py-20 text-center">
                <h1 className="text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
                    Crédito sin colateral para PyMEs LatAm.
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
                    Aval conecta liquidez global en USDC con PyMEs verificadas por issuers locales. Sin garantía, con
                    attestations firmadas on-chain. Construido sobre Avalanche.
                </p>
                <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                        href="/lend"
                        className="rounded-full bg-foreground px-8 py-3 text-base font-medium text-background hover:opacity-90"
                    >
                        Prestar USDC
                    </Link>
                    <Link
                        href="/borrow"
                        className="rounded-full border border-zinc-300 px-8 py-3 text-base font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                        Solicitar crédito
                    </Link>
                </div>
                {!isConnected && (
                    <p className="mt-4 text-sm text-zinc-500">Conectá tu wallet (Fuji testnet) para empezar.</p>
                )}
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-24">
                <div className="grid gap-6 sm:grid-cols-3">
                    <Card
                        title="Para lenders"
                        body="Depositá USDC en un pool ERC-4626. Recibí shares (avUSDC) que rinden por las fees cobradas a borrowers."
                        href="/lend"
                        cta="Ir a Lend"
                    />
                    <Card
                        title="Para PyMEs"
                        body="Onboarding KYB en minutos. Recibí una línea de crédito firmada por un issuer local. Tomá préstamos a término en USDC."
                        href="/borrow"
                        cta="Ir a Borrow"
                    />
                    <Card
                        title="Stats del protocolo"
                        body="TVL, préstamos activos, defaults realizados. Todo verificable on-chain en Snowtrace."
                        href="/stats"
                        cta="Ver stats"
                    />
                </div>
            </section>
        </div>
    );
}

function Card({title, body, href, cta}: {title: string; body: string; href: string; cta: string}) {
    return (
        <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
            <Link href={href} className="mt-4 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                {cta} →
            </Link>
        </div>
    );
}
