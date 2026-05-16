"use client";

import {useReadContract} from "wagmi";

import {contracts, isDeployed, lendingPoolAbi} from "@/lib/contracts";
import {formatUsdc, shortAddress, snowtraceUrl} from "@/lib/format";

export default function StatsPage() {
    const deployed = isDeployed(contracts.lendingPool);

    const {data: tvl} = useReadContract({
        address: contracts.lendingPool,
        abi: lendingPoolAbi,
        functionName: "totalAssets",
        query: {enabled: deployed},
    });

    return (
        <main className="mx-auto max-w-4xl px-6 py-12">
            <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">Estado del protocolo, verificable on-chain en Snowtrace.</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <Stat label="TVL del pool" value={deployed ? `$${formatUsdc(tvl as bigint | undefined)} USDC` : "—"} />
                <Stat label="Red" value="Avalanche Fuji testnet (43113)" />
            </div>

            <h2 className="mt-12 text-lg font-semibold">Contratos</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                    <tbody>
                        <ContractRow name="USDC" address={contracts.usdc} />
                        <ContractRow name="IssuerRegistry" address={contracts.issuerRegistry} />
                        <ContractRow name="LendingPool (ERC-4626)" address={contracts.lendingPool} />
                        <ContractRow name="CreditManager" address={contracts.creditManager} />
                    </tbody>
                </table>
            </div>

            {!deployed && (
                <p className="mt-6 text-sm text-zinc-500">
                    Aún no desplegado. Después de <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">forge script Deploy.s.sol</code>{" "}
                    pegá las addresses en <code>web/.env.local</code>.
                </p>
            )}
        </main>
    );
}

function Stat({label, value}: {label: string; value: string}) {
    return (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
        </div>
    );
}

function ContractRow({name, address}: {name: string; address: string}) {
    const zero = address === "0x0000000000000000000000000000000000000000";
    return (
        <tr className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
            <td className="px-4 py-3 font-medium">{name}</td>
            <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                {zero ? (
                    "no desplegado"
                ) : (
                    <a href={snowtraceUrl(address)} target="_blank" rel="noreferrer" className="hover:underline">
                        {shortAddress(address)} ↗
                    </a>
                )}
            </td>
        </tr>
    );
}
