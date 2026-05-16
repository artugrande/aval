"use client";

import {useReadContract} from "wagmi";
import {avalancheFuji} from "wagmi/chains";

import {getContracts, isDeployed, lendingPoolAbi, type ChainContracts} from "@/lib/contracts";
import {avalL1} from "@/lib/wagmi-chains";
import {formatUsdc, shortAddress, snowtraceUrl} from "@/lib/format";

interface ChainInfo {
    chainId: number;
    name: string;
    nativeToken: string;
    explorerBase: string | null; // null = no explorer (Aval L1 yet)
    accent: string; // tailwind color class
    logo: string;
}

const CHAINS: ChainInfo[] = [
    {chainId: avalancheFuji.id, name: "Avalanche Fuji C-Chain", nativeToken: "AVAX", explorerBase: "https://testnet.snowtrace.io", accent: "text-red-600 dark:text-red-400", logo: "/avax.svg"},
    {chainId: avalL1.id, name: "Aval L1 (Subnet-EVM)", nativeToken: "AVL", explorerBase: process.env.NEXT_PUBLIC_AVAL_L1_EXPLORER || null, accent: "text-red-600 dark:text-red-400", logo: "/aval.svg"},
];

export default function StatsPage() {
    return (
        <main className="mx-auto max-w-5xl px-6 py-12">
            <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                El protocolo corre en dos chains. El demo principal es Avalanche Fuji C-Chain (público); Aval L1 es nuestra propia
                Subnet-EVM corriendo en Avacloud — misma API de contratos, gas pagado en `AVL`.
            </p>

            <ComplianceStack />

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
                {CHAINS.map((chain) => (
                    <ChainCard key={chain.chainId} chain={chain} />
                ))}
            </div>
        </main>
    );
}

function ComplianceStack() {
    return (
        <section className="mt-8 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-6 dark:border-blue-900/60 dark:from-blue-950/40 dark:to-cyan-950/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/wavynode-dark.svg" alt="WavyNode" className="h-7 w-7" />
                    <div>
                        <div className="text-xs uppercase tracking-wider text-blue-700 dark:text-blue-300">
                            Compliance stack
                        </div>
                        <h2 className="text-lg font-semibold text-blue-950 dark:text-blue-100">
                            Powered by WavyNode
                        </h2>
                    </div>
                </div>
                <a
                    href="https://wavynode.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-700 underline hover:text-blue-900 dark:text-blue-200"
                >
                    wavynode.com ↗
                </a>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <ComplianceCell
                    title="AML on-chain"
                    body="Cada wallet pasa por scan-risk de WavyNode antes de que Claude la apruebe. Score < 60 = OK; ≥ 60 o suspicious activity = reject automático."
                />
                <ComplianceCell
                    title="Monitoreo continuo"
                    body="Las wallets aprobadas quedan registradas en WavyNode para alertas en tiempo real sobre interacciones con direcciones flaggeadas."
                />
                <ComplianceCell
                    title="Reportes regulatorios"
                    body="Reportes mensuales PDF en /lend para 🇲🇽 CNBV, 🇨🇴 SFC, 🇸🇻 CNAD y 🇬🇹 SIB. Auto-generados desde la actividad on-chain del pool."
                />
            </div>
        </section>
    );
}

function ComplianceCell({title, body}: {title: string; body: string}) {
    return (
        <div className="rounded-lg border border-blue-200/60 bg-white/60 p-4 backdrop-blur dark:border-blue-900/60 dark:bg-zinc-950/40">
            <div className="text-sm font-semibold text-blue-950 dark:text-blue-100">{title}</div>
            <p className="mt-1 text-xs text-blue-900/80 dark:text-blue-200/80">{body}</p>
        </div>
    );
}

function ChainCard({chain}: {chain: ChainInfo}) {
    const contracts = getContracts(chain.chainId);
    const deployed = isDeployed(contracts.lendingPool);

    const {data: tvl} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "totalAssets",
        chainId: chain.chainId,
        query: {enabled: deployed},
    });

    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={chain.logo} alt="" className="h-7 w-7 shrink-0 object-contain" />
                    <h2 className={`text-lg font-semibold ${chain.accent}`}>{chain.name}</h2>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">chainId {chain.chainId}</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Stat label="TVL del pool" value={deployed ? `$${formatUsdc(tvl as bigint | undefined)} USDC` : "—"} />
                <Stat label="Gas token" value={chain.nativeToken} />
            </div>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-zinc-500">Contratos</h3>
            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                    <tbody>
                        <ContractRow name="USDC" address={contracts.usdc} explorerBase={chain.explorerBase} />
                        <ContractRow name="IssuerRegistry" address={contracts.issuerRegistry} explorerBase={chain.explorerBase} />
                        <ContractRow name="LendingPool" address={contracts.lendingPool} explorerBase={chain.explorerBase} />
                        <ContractRow name="CreditManager" address={contracts.creditManager} explorerBase={chain.explorerBase} />
                    </tbody>
                </table>
            </div>

            {!deployed && (
                <p className="mt-3 text-xs text-zinc-500">Aún no desplegado en esta chain.</p>
            )}
        </div>
    );
}

function Stat({label, value}: {label: string; value: string}) {
    return (
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="mt-0.5 text-lg font-semibold">{value}</div>
        </div>
    );
}

function ContractRow({name, address, explorerBase}: {name: string; address: string; explorerBase: string | null}) {
    const zero = address === "0x0000000000000000000000000000000000000000";
    const url = explorerBase ? `${explorerBase}/address/${address}` : null;
    return (
        <tr className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
            <td className="px-3 py-2 font-medium">{name}</td>
            <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                {zero ? (
                    "no desplegado"
                ) : url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                        {shortAddress(address)} ↗
                    </a>
                ) : (
                    <span>{shortAddress(address)}</span>
                )}
            </td>
        </tr>
    );
}
