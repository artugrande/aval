"use client";

import {useCallback, useEffect, useState} from "react";
import {keccak256, stringToBytes, type Address, type Hex} from "viem";
import {useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt} from "wagmi";
import {avalancheFuji} from "wagmi/chains";

import {
    borrowerRegistryAbi,
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
import {chainLabel, explorerUrl, formatUsdc, parseUsdc} from "@/lib/format";
import {
    kybReview,
    kybStatus,
    scoreAttest,
    type AttestationResponse,
    type KybStatusResponse,
    type WavynodeAml,
} from "@/lib/api";
import {useBorrowerLoans} from "@/hooks/useBorrowerLoans";
import {WrongChainNotice} from "@/components/WrongChainNotice";

type ProfileStatus = KybStatusResponse["status"];

const INDUSTRIES = ["SaaS", "Ecommerce", "Agency", "Marketplace", "Import/Export", "Fintech", "Crypto/Web3", "Education", "Professional Services", "Manufacturing", "Other"] as const;
const BUSINESS_MODELS = ["B2B", "B2C", "Subscription", "Services", "Marketplace", "Trading"] as const;
const VOLUMES = ["<1k USD", "1k–10k USD", "10k–50k USD", "50k+ USD"] as const;
const COUNTRIES: Array<{code: "MX" | "AR" | "BR" | "CO" | "PE" | "CL" | "UY"; label: string}> = [
    {code: "MX", label: "México (RFC)"},
    {code: "AR", label: "Argentina (CUIT)"},
    {code: "BR", label: "Brasil (CNPJ)"},
    {code: "CO", label: "Colombia (NIT)"},
    {code: "PE", label: "Perú (RUC)"},
    {code: "CL", label: "Chile (RUT)"},
    {code: "UY", label: "Uruguay (RUT)"},
];

export default function BorrowPage() {
    const {address, isConnected} = useAccount();
    const chainId = useChainId();
    const contracts = getContracts(chainId);
    const [profile, setProfile] = useState<KybStatusResponse | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // On-chain truth: is this wallet on the BorrowerRegistry of the active chain?
    const {data: isOnChainApproved, refetch: refetchOnChain} = useReadContract({
        address: contracts.borrowerRegistry,
        abi: borrowerRegistryAbi,
        functionName: "isApproved",
        args: address ? [address] : undefined,
        query: {enabled: isDeployed(contracts.borrowerRegistry) && !!address},
    });

    // DB state: tells us if user has submitted, if rejected with reason, etc.
    const loadStatus = useCallback(async () => {
        if (!address) return;
        setProfileLoading(true);
        try {
            const res = await kybStatus({wallet: address});
            setProfile(res);
        } catch (e) {
            setError(e instanceof Error ? e.message : "status_failed");
        } finally {
            setProfileLoading(false);
        }
    }, [address]);

    useEffect(() => {
        if (isConnected && address) void loadStatus();
    }, [isConnected, address, loadStatus]);

    if (!isDeployed(contracts.creditManager)) return <Notice title="Aval no opera en esta red" body="Switcheá tu wallet a Fuji o Aval L1." />;
    if (!isConnected) return <Notice title="Conectá tu wallet" body="Usá el botón arriba a la derecha para empezar." />;
    if (!isDeployed(contracts.borrowerRegistry)) return <WrongChainNotice />;

    const dbStatus: ProfileStatus = profile?.status ?? "none";

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <h1 className="text-3xl font-semibold tracking-tight">Solicitar crédito</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Completá tu Business Profile, lo revisa nuestra AI, y al aprobarse quedás registrado on-chain en{" "}
                <span className="font-medium">{chainLabel(chainId)}</span>. Después podés pedir préstamos.
            </p>

            {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

            {(() => {
                if (profileLoading && !profile) return <SkeletonCard />;
                if (isOnChainApproved) return <BorrowForm wallet={address!} wavynode={profile?.wavynode ?? null} onError={setError} />;
                if (dbStatus === "pending_review") return <PendingNotice onRefresh={loadStatus} />;
                if (dbStatus === "rejected") {
                    return (
                        <RejectedNotice
                            reason={profile?.aiReason ?? "Sin razón provista."}
                            attempts={profile?.attempts ?? 0}
                            wavynode={profile?.wavynode ?? null}
                            onRetry={() => setProfile({...profile!, status: "none"})}
                        />
                    );
                }
                // Only show the "on-chain sync" notice if we ACTUALLY fired an on-chain tx.
                // Legacy auto-approved rows from the old kyb-submit flow have status='approved'
                // but no onchainTxHash → fall through to the KYB form so the user can submit
                // a fresh review and get registered on-chain properly.
                if (dbStatus === "approved" && profile?.onchainTxHash && !isOnChainApproved) {
                    return (
                        <OnchainSyncNotice
                            txHash={profile.onchainTxHash}
                            txChainId={profile.onchainChainId ?? null}
                            activeChainId={chainId}
                            onRefresh={() => {
                                refetchOnChain();
                                loadStatus();
                            }}
                        />
                    );
                }
                return (
                    <KybForm
                        wallet={address!}
                        chainId={chainId}
                        onApproved={async () => {
                            await loadStatus();
                            await refetchOnChain();
                        }}
                        onRejected={(reason) =>
                            setProfile({
                                ...((profile ?? {}) as KybStatusResponse),
                                status: "rejected",
                                aiReason: reason,
                            })
                        }
                        onError={setError}
                    />
                );
            })()}
        </main>
    );
}

// ───── KYB form ─────

function KybForm({
    wallet,
    chainId,
    onApproved,
    onRejected,
    onError,
}: {
    wallet: Address;
    chainId: number;
    onApproved: () => void;
    onRejected: (reason: string) => void;
    onError: (e: string) => void;
}) {
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        // Company Information
        businessName: "",
        website: "",
        country: "MX" as (typeof COUNTRIES)[number]["code"],
        taxId: "",
        // Business Activity
        industry: "" as (typeof INDUSTRIES)[number] | "",
        businessModel: "" as (typeof BUSINESS_MODELS)[number] | "",
        // Expected Usage
        monthlyVolume: "" as (typeof VOLUMES)[number] | "",
        // Representative
        repFullName: "",
        repRole: "",
        repEmail: "",
        repLinkedin: "",
    });

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const taxIdHash = form.taxId.trim()
                ? keccak256(stringToBytes(`${form.country}:${form.taxId.trim()}`))
                : undefined;
            const res = await kybReview({
                wallet,
                chainId,
                businessName: form.businessName.trim(),
                website: form.website.trim(),
                country: form.country,
                taxIdHash,
                industry: form.industry as string,
                businessModel: form.businessModel as string,
                monthlyVolume: form.monthlyVolume as string,
                repFullName: form.repFullName.trim(),
                repRole: form.repRole.trim(),
                repEmail: form.repEmail.trim(),
                repLinkedin: form.repLinkedin.trim() || undefined,
            });
            if (res.decision === "approve") {
                onApproved();
            } else {
                onRejected(res.reason);
            }
        } catch (err) {
            onError(err instanceof Error ? err.message : "submit_failed");
        } finally {
            setSubmitting(false);
        }
    };

    const requiredFilled =
        form.businessName && form.website && form.industry && form.businessModel && form.monthlyVolume &&
        form.repFullName && form.repRole && form.repEmail;

    return (
        <form onSubmit={onSubmit} className="mt-8 space-y-6">
            <Section title="1. Información de la empresa">
                <Field label="Razón social">
                    <input className="input" required value={form.businessName} onChange={(e) => setForm({...form, businessName: e.target.value})} placeholder="Software Factory S.A." />
                </Field>
                <Field label="Website">
                    <input className="input" required value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} placeholder="https://tusoftwareconia.mx" />
                </Field>
                <Field label="País">
                    <select className="input" value={form.country} onChange={(e) => setForm({...form, country: e.target.value as typeof form.country})}>
                        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                </Field>
                <Field label="Tax ID (opcional)">
                    <input className="input" value={form.taxId} onChange={(e) => setForm({...form, taxId: e.target.value})} placeholder="Solo se guarda el hash" />
                </Field>
            </Section>

            <Section title="2. Actividad del negocio">
                <Field label="¿Qué describe mejor tu negocio?">
                    <select className="input" required value={form.industry} onChange={(e) => setForm({...form, industry: e.target.value as typeof form.industry})}>
                        <option value="" disabled>Seleccionar</option>
                        {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                </Field>
                <Field label="Modelo de negocio">
                    <select className="input" required value={form.businessModel} onChange={(e) => setForm({...form, businessModel: e.target.value as typeof form.businessModel})}>
                        <option value="" disabled>Seleccionar</option>
                        {BUSINESS_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                </Field>
            </Section>

            <Section title="3. Ingresos mensuales recurrentes">
                <Field label="Volumen mensual" className="sm:col-span-2">
                    <select className="input" required value={form.monthlyVolume} onChange={(e) => setForm({...form, monthlyVolume: e.target.value as typeof form.monthlyVolume})}>
                        <option value="" disabled>Seleccionar</option>
                        {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Field>
            </Section>

            <Section title="4. Representante del negocio">
                <Field label="Nombre completo">
                    <input className="input" required value={form.repFullName} onChange={(e) => setForm({...form, repFullName: e.target.value})} placeholder="María Pérez" />
                </Field>
                <Field label="Rol">
                    <input className="input" required value={form.repRole} onChange={(e) => setForm({...form, repRole: e.target.value})} placeholder="Founder, CEO, COO…" />
                </Field>
                <Field label="Email corporativo">
                    <input className="input" type="email" required value={form.repEmail} onChange={(e) => setForm({...form, repEmail: e.target.value})} placeholder="maria@tusoftwareconia.mx" />
                </Field>
                <Field label="LinkedIn (opcional)">
                    <input className="input" type="url" value={form.repLinkedin} onChange={(e) => setForm({...form, repLinkedin: e.target.value})} placeholder="https://linkedin.com/in/maria-perez" />
                </Field>
            </Section>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                Al enviar corremos un <span className="font-medium">AML scan on-chain via WavyNode</span> sobre tu wallet, Claude AI
                evalúa el Business Profile (~10s) y si aprobamos registramos tu wallet on-chain en las dos chains (Fuji + Aval L1).
            </div>

            <button
                type="submit"
                disabled={submitting || !requiredFilled}
                className="w-full rounded-lg bg-foreground px-5 py-3 font-medium text-background disabled:opacity-40"
            >
                {submitting ? "Escaneando AML on-chain + revisando con AI + registrando…" : "Enviar Business Profile"}
            </button>
        </form>
    );
}

function PendingNotice({onRefresh}: {onRefresh: () => void}) {
    return (
        <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-950">
            <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">🤔 Revisando tu solicitud</h2>
            <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                WavyNode está corriendo el escaneo AML on-chain y Claude AI está evaluando tu Business Profile.
                Normalmente esto se resuelve en segundos — si llegaste a esta pantalla, recargá en un momento.
            </p>
            <button
                onClick={onRefresh}
                className="mt-4 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-100"
            >
                Recargar estado
            </button>
        </div>
    );
}

function RejectedNotice({reason, attempts, wavynode, onRetry}: {reason: string; attempts: number; wavynode: WavynodeAml | null; onRetry: () => void}) {
    return (
        <div className="mt-8 space-y-3">
            {wavynode && <AmlBadge wavynode={wavynode} />}
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
                <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">❌ Solicitud rechazada</h2>
                <p className="mt-2 text-sm text-red-800 dark:text-red-200">{reason}</p>
                <p className="mt-3 text-xs text-red-700 dark:text-red-300">Intentos: {attempts}</p>
                <button
                    onClick={onRetry}
                    className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                    Volver a enviar con datos corregidos
                </button>
            </div>
        </div>
    );
}

/// Reusable AML pill that summarizes the latest WavyNode scan for the borrower.
/// Three states: pending (no score yet), clean (green), flagged (red).
function AmlBadge({wavynode}: {wavynode: WavynodeAml | null}) {
    if (!wavynode) return null;
    const score = wavynode.riskScore;
    const flagged = wavynode.suspicious === true || (score != null && score >= 60) || wavynode.riskLevel === "high" || wavynode.riskLevel === "critical";

    if (score == null && !wavynode.scannedAt) {
        return (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
                        <span className="font-medium">🔍 AML scan en curso · WavyNode</span>
                    </div>
                    <span className="text-xs text-zinc-500">Análisis on-chain</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                    Tu wallet ya está registrada para monitoreo continuo. El score aparece acá apenas WavyNode termine el análisis.
                </p>
            </div>
        );
    }

    if (flagged) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-800 dark:bg-red-950">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-red-900 dark:text-red-100">
                        <span>⚠</span>
                        <span className="font-medium">Wallet flaggeada · WavyNode</span>
                    </div>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-100">
                        Score {score ?? "—"}/100{wavynode.riskLevel ? ` · ${wavynode.riskLevel}` : ""}
                    </span>
                </div>
                {wavynode.riskReason && (
                    <p className="mt-1 text-xs text-red-800 dark:text-red-200">{wavynode.riskReason}</p>
                )}
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                    <span>✓</span>
                    <span className="font-medium">AML verificado · WavyNode</span>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                    Score {score}/100{wavynode.riskLevel ? ` · ${wavynode.riskLevel}` : ""}
                </span>
            </div>
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                {wavynode.txAnalyzed != null && wavynode.txAnalyzed > 0
                    ? `${wavynode.txAnalyzed.toLocaleString("en-US")} transacciones analizadas on-chain`
                    : "Sin patrones de riesgo detectados"}
                {wavynode.patternsDetected != null && wavynode.patternsDetected > 0
                    ? ` · ${wavynode.patternsDetected} patrón${wavynode.patternsDetected === 1 ? "" : "es"} de bajo riesgo`
                    : ""}
                . Wallet bajo monitoreo continuo.
            </p>
        </div>
    );
}

function OnchainSyncNotice({
    txHash,
    txChainId,
    activeChainId,
    onRefresh,
}: {
    txHash: string | null;
    txChainId: number | null;
    activeChainId: number;
    onRefresh: () => void;
}) {
    const txUrl = txHash && txChainId ? explorerUrl(txChainId, txHash, "tx") : null;
    const wrongChain = txChainId != null && txChainId !== activeChainId;
    return (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
            <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                {wrongChain ? "Aprobación en otra chain" : "Aprobación on-chain en progreso"}
            </h2>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                {wrongChain
                    ? `Tu KYB fue aprobado en ${chainLabel(txChainId!)} pero estás conectado a ${chainLabel(activeChainId)}. Cambiá de red o recargá si ya te aprobamos en ambas.`
                    : "Tu KYB fue aprobado off-chain pero el registro en cadena todavía no se confirmó. Recargá en unos segundos."}
            </p>
            {txUrl && (
                <a href={txUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">
                    Ver tx ↗
                </a>
            )}
            <div className="mt-4">
                <button
                    onClick={onRefresh}
                    className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                    Recargar
                </button>
            </div>
        </div>
    );
}

function ErrorBanner({message, onClose}: {message: string; onClose: () => void}) {
    return (
        <div className="mt-6 flex items-start justify-between rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            <span>{message}</span>
            <button onClick={onClose} className="ml-3 text-xs underline">cerrar</button>
        </div>
    );
}

// ───── Borrow form (after on-chain approval) ─────

function BorrowForm({wallet, wavynode, onError}: {wallet: Address; wavynode: WavynodeAml | null; onError: (e: string) => void}) {
    const chainId = useChainId();
    const contracts = getContracts(chainId);
    const [amount, setAmount] = useState("");
    const [tenor, setTenor] = useState(30);
    const [busy, setBusy] = useState(false);
    const [txHash, setTxHash] = useState<Hex | undefined>();
    const [bootstrap, setBootstrap] = useState<{level: number; capUsd: number; nextCapUsd: number | null; repaidCount: number; score: number} | null>(null);

    const feeBps = bootstrap ? feeBpsForLevel(bootstrap.level) : feeBpsForLevel(1);

    const {data: outstanding, refetch: refetchOutstanding} = useReadContract({
        address: contracts.creditManager,
        abi: creditManagerAbi,
        functionName: "outstanding",
        args: [wallet],
    });
    const {loans, refetch: refetchLoans} = useBorrowerLoans(wallet);
    const {writeContractAsync} = useWriteContract();
    const {isLoading: mining, isSuccess} = useWaitForTransactionReceipt({hash: txHash});

    // Initial bootstrap state — fetch a fresh attestation to get current cap/level
    useEffect(() => {
        let cancelled = false;
        scoreAttest({wallet, chainId})
            .then((att) => {
                if (cancelled) return;
                setBootstrap({
                    level: att.bootstrap.level,
                    capUsd: att.bootstrap.maxCapUsd,
                    nextCapUsd: att.bootstrap.nextLevelCapUsd,
                    repaidCount: att.bootstrap.repaidCount,
                    score: att.bootstrap.score,
                });
            })
            .catch((e) => onError(e instanceof Error ? e.message : "attestation_preview_failed"));
        return () => { cancelled = true; };
    }, [wallet, chainId, onError]);

    useEffect(() => {
        if (isSuccess) {
            refetchLoans();
            refetchOutstanding();
            scoreAttest({wallet, chainId}).then((att) => {
                setBootstrap({
                    level: att.bootstrap.level,
                    capUsd: att.bootstrap.maxCapUsd,
                    nextCapUsd: att.bootstrap.nextLevelCapUsd,
                    repaidCount: att.bootstrap.repaidCount,
                    score: att.bootstrap.score,
                });
            }).catch(() => {});
        }
    }, [isSuccess, refetchLoans, refetchOutstanding, wallet, chainId]);

    const onLoanRepaid = () => {
        refetchLoans();
        refetchOutstanding();
        scoreAttest({wallet, chainId}).then((att) => {
            setBootstrap({
                level: att.bootstrap.level,
                capUsd: att.bootstrap.maxCapUsd,
                nextCapUsd: att.bootstrap.nextLevelCapUsd,
                repaidCount: att.bootstrap.repaidCount,
                score: att.bootstrap.score,
            });
        }).catch(() => {});
    };

    const parsed = safeParseAmount(amount);
    const capMicro = bootstrap ? BigInt(bootstrap.capUsd) * 1_000_000n : 0n;
    const exceeds = parsed != null && ((outstanding as bigint | undefined) ?? 0n) + parsed > capMicro;

    const submit = async () => {
        if (parsed == null) return;
        setBusy(true);
        try {
            const att: AttestationResponse = await scoreAttest({wallet, chainId: avalancheFuji.id === chainId ? chainId : chainId});
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

    if (!bootstrap) return <SkeletonCard />;

    const maxLevel = 11;
    const progressPct = Math.round((bootstrap.level / maxLevel) * 100);

    return (
        <div className="mt-8 space-y-4">
            <AmlBadge wavynode={wavynode} />
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-bold text-background">
                                L{bootstrap.level}
                            </span>
                            <span className="text-xs uppercase tracking-wider text-zinc-500">Tu línea de crédito</span>
                        </div>
                        <div className="mt-2 text-3xl font-semibold">${bootstrap.capUsd.toLocaleString("en-US")} USDC</div>
                        <div className="mt-1 text-xs text-zinc-500">
                            {bootstrap.repaidCount} préstamo{bootstrap.repaidCount === 1 ? "" : "s"} repagado
                            {bootstrap.repaidCount === 1 ? "" : "s"} · Score {bootstrap.score} / 1000
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div className="h-full bg-foreground transition-all" style={{width: `${progressPct}%`}} />
                    </div>
                    {bootstrap.nextCapUsd != null ? (
                        <p className="mt-2 text-xs text-zinc-500">
                            Repagá 1 préstamo más → L{bootstrap.level + 1}: cap sube a ${bootstrap.nextCapUsd.toLocaleString("en-US")} USDC.
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
                        <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" className="input" />
                    </Field>
                    <Field label="Plazo (días)">
                        <input type="number" min={1} max={365} value={tenor} onChange={(e) => setTenor(Number(e.target.value))} className="input" />
                    </Field>
                </div>

                <div className="mt-4 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
                    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                        <span className="text-zinc-500">Tasa del protocolo (L{bootstrap.level})</span>
                        <span className="font-semibold">{formatPercentage(feeBps)}</span>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end sm:gap-2">
                        <span className="text-zinc-500">A repagar</span>
                        <span className="font-semibold">${parsed ? formatUsdc(parsed + (parsed * BigInt(feeBps)) / 10_000n) : "—"} USDC</span>
                    </div>
                </div>

                <button
                    onClick={submit}
                    disabled={busy || mining || parsed == null || exceeds}
                    className="mt-6 rounded-lg bg-foreground px-5 py-2.5 font-medium text-background disabled:opacity-40"
                >
                    {busy ? "Firmando attestation…" : mining ? "Confirmando…" : exceeds ? "Excede tu cap" : "Pedir préstamo"}
                </button>
                {isSuccess && txHash && (
                    <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                        ✓ Préstamo abierto on-chain.{" "}
                        {explorerUrl(chainId, txHash, "tx") && (
                            <a href={explorerUrl(chainId, txHash, "tx")!} target="_blank" rel="noreferrer" className="underline">Ver tx</a>
                        )}
                    </p>
                )}
            </div>

            <LoanList wallet={wallet} loans={loans} onLoanRepaid={onLoanRepaid} onError={onError} />
        </div>
    );
}

function LoanList({wallet, loans, onLoanRepaid, onError}: {wallet: Address; loans: Loan[]; onLoanRepaid: () => void; onError: (e: string) => void}) {
    if (loans.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Tus préstamos</h2>
                <p className="mt-2 text-sm text-zinc-500">Todavía no tenés préstamos. Pedí uno arriba.</p>
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

function LoanCard({loan, wallet, onRepaid, onError}: {loan: Loan; wallet: Address; onRepaid: () => void; onError: (e: string) => void}) {
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

    const needsApproval = ((allowance as bigint | undefined) ?? 0n) < total;
    const hasFunds = ((balance as bigint | undefined) ?? 0n) >= total;
    const shortfall = total - ((balance as bigint | undefined) ?? 0n);

    useEffect(() => {
        if (!isSuccess || !hash) return;
        refetchBalance();
        refetchAllowance();
        if (!needsApproval) onRepaid();
        reset();
    }, [isSuccess, hash, needsApproval, onRepaid, refetchAllowance, refetchBalance, reset]);

    const doAction = () => {
        try {
            if (needsApproval) {
                writeContract({address: contracts.usdc, abi: erc20Abi, functionName: "approve", args: [contracts.creditManager, total]});
            } else {
                writeContract({address: contracts.creditManager, abi: creditManagerAbi, functionName: "repay", args: [loan.loanId]});
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
                        {status === "repaid" ? "Repagado ✓" : status === "defaulted" ? "En default" :
                         status === "overdue" ? `Vencido hace ${-daysToMaturity}d` : `Vence en ${daysToMaturity}d`}
                    </div>
                </div>
                {(status === "active" || status === "overdue") && (
                    <div className="flex flex-col items-end gap-2">
                        <button onClick={doAction} disabled={isPending || mining || !hasFunds} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40">
                            {isPending || mining ? "Procesando…" : !hasFunds ? "Saldo insuficiente" : needsApproval ? "Aprobar mUSDC" : "Repagar"}
                        </button>
                        {!hasFunds && (
                            <p className="text-right text-xs text-zinc-500">
                                Faltan ${formatUsdc(shortfall)} mUSDC.<br />
                                <a href="/lend" className="underline">Conseguir en /lend</a>
                            </p>
                        )}
                        {hash && explorerUrl(chainId, hash, "tx") && (
                            <a href={explorerUrl(chainId, hash, "tx")!} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 underline">Ver tx ↗</a>
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

// ───── shared bits ─────

function Section({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <fieldset className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <legend className="px-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">{title}</legend>
            <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        </fieldset>
    );
}

function Field({label, children, className}: {label: string; children: React.ReactNode; className?: string}) {
    return (
        <label className={`block ${className ?? ""}`}>
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

function SkeletonCard() {
    return (
        <div className="mt-8 animate-pulse rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-4 h-9 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-3 h-3 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
            <p className="mt-4 text-xs text-zinc-500">Cargando…</p>
        </div>
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
