"use client";

import Link from "next/link";
import {useAccount} from "wagmi";

export default function Home() {
    const {isConnected} = useAccount();

    return (
        <div className="bg-zinc-50 font-sans dark:bg-black">
            {/* ───── Hero ───── */}
            <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
                <h1 className="text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
                    Crédito global para
                    <br />
                    PyMEs de LatAm.
                </h1>
                <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
                    Accedé a financiamiento en dólares digitales de forma rápida, transparente y sin depender de
                    bancos tradicionales.
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
                    <p className="mt-4 text-sm text-zinc-500">Conectá tu wallet para empezar.</p>
                )}
            </section>

            {/* ───── El problema ───── */}
            <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mx-auto max-w-6xl px-6 py-20">
                    <div className="max-w-3xl">
                        <span className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
                            El problema
                        </span>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                            LatAm tiene una brecha de financiamiento PyME de más de{" "}
                            <span className="text-red-600 dark:text-red-400">US$100B</span>.
                        </h2>
                        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                            Las PyMEs representan <strong>casi el 99% de las empresas</strong> de la región y generan{" "}
                            <strong>más del 60% del empleo formal</strong> — pero millones siguen sin acceso a crédito
                            adecuado.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <CountryStat flag="🇲🇽" country="México" pct="85%" />
                        <CountryStat flag="🇦🇷" country="Argentina" pct="78%" />
                        <CountryStat flag="🇨🇴" country="Colombia" pct="76%" />
                        <CountryStat flag="🇵🇪" country="Perú" pct="45%" />
                    </div>
                    <p className="mt-4 text-sm text-zinc-500">
                        Porcentaje de negocios que enfrentan dificultades para acceder a financiamiento o crédito
                        formal.
                    </p>
                </div>
            </section>

            {/* ───── Cómo funciona ───── */}
            <section className="border-t border-zinc-200 dark:border-zinc-800">
                <div className="mx-auto max-w-6xl px-6 py-20">
                    <div className="max-w-3xl">
                        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                            Cómo funciona Aval
                        </span>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                            Tu cap arranca chico y crece pagando.
                        </h2>
                        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                            Sin extractos bancarios, sin facturas, sin scoring opaco. Cada PyME arranca en{" "}
                            <strong>L1 con un cap de $100 USDC</strong>. Cada préstamo repagado a tiempo te sube de
                            nivel, hasta $20,000 en L11. La tasa baja a medida que tu nivel sube — menos riesgo, mejor
                            precio.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {LEVELS.map((l) => (
                            <LevelCard key={l.level} {...l} />
                        ))}
                    </div>

                    <p className="mt-6 text-sm text-zinc-500">
                        Default → L0 + blacklist. La economía hace el resto: el costo de crear wallet + KYB + perder
                        $100 supera lo que un atacante puede sacar al inicio. La confianza se gana préstamo a préstamo.
                    </p>
                </div>
            </section>

            {/* ───── Por qué Aval es distinto ───── */}
            <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mx-auto max-w-6xl px-6 py-20">
                    <div className="max-w-3xl">
                        <span className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
                            Por qué Aval es distinto
                        </span>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                            Pensado para PyMEs de LatAm, no para bancos tradicionales.
                        </h2>
                        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                            Construimos nuestra propia infraestructura financiera sobre Avalanche para ofrecer una
                            experiencia más rápida, transparente y predecible desde el día uno.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        <Advantage
                            iconImg="/usdclogo.png"
                            title="Todo en dólares digitales"
                            body={
                                <>
                                    <p>Operás en USDC de punta a punta: préstamos, repagos y comisiones.</p>
                                    <p className="mt-2">Simple, transparente y estable desde el primer día.</p>
                                </>
                            }
                        />
                        <Advantage
                            icon="📊"
                            title="Costos transparentes"
                            body={
                                <>
                                    <p>Antes de aceptar un préstamo ves exactamente:</p>
                                    <ul className="mt-2 ml-4 list-disc space-y-0.5">
                                        <li>cuánto recibís,</li>
                                        <li>cuánto devolvés,</li>
                                        <li>y cuándo.</li>
                                    </ul>
                                    <p className="mt-2">Sin letra chica. Sin cargos sorpresa. Sin tasas que cambian después.</p>
                                </>
                            }
                        />
                        <Advantage
                            icon="⚡"
                            title="Operaciones en segundos"
                            body={
                                <>
                                    <p>No dependemos de horarios bancarios ni procesos manuales.</p>
                                    <p className="mt-2">Las operaciones se procesan en segundos, 24/7.</p>
                                </>
                            }
                        />
                        <Advantage
                            icon="🔍"
                            title="Transparencia verificable"
                            body={
                                <>
                                    <p>
                                        Cada préstamo y cada repago quedan registrados en una infraestructura pública y
                                        auditable.
                                    </p>
                                    <p className="mt-2">
                                        Vos, un auditor o incluso tu contador pueden verificar toda la actividad en
                                        tiempo real.
                                    </p>
                                </>
                            }
                        />
                        <Advantage
                            icon="📈"
                            title="Tu reputación financiera te pertenece"
                            body={
                                <>
                                    <p>Cada préstamo repagado construye historial y aumenta tu acceso a capital.</p>
                                    <p className="mt-2">
                                        Tu reputación no queda encerrada en un solo banco o institución.
                                    </p>
                                </>
                            }
                        />
                        <Advantage
                            icon="🌎"
                            title="Diseñado para LatAm"
                            body={
                                <>
                                    <p>Construido desde el día uno para empresas de:</p>
                                    <ul className="mt-2 ml-4 list-disc space-y-0.5">
                                        <li>🇲🇽 México</li>
                                        <li>🇦🇷 Argentina</li>
                                        <li>🇨🇴 Colombia</li>
                                        <li>🇵🇪 Perú</li>
                                        <li>y el resto de la región.</li>
                                    </ul>
                                </>
                            }
                        />
                    </div>

                    {/* AI verification callout */}
                    <div className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-black p-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/claudelogo.png" alt="Claude (Anthropic)" className="h-full w-full object-contain" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold">
                                        Verificación con IA en{" "}
                                        <span className="text-red-600 dark:text-red-400">segundos</span>, no semanas
                                    </h3>
                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                        Tu Business Profile lo revisa <strong>Claude Haiku 4.5</strong> de{" "}
                                        <a
                                            href="https://www.anthropic.com"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
                                        >
                                            Anthropic
                                        </a>{" "}
                                        en menos de 15 segundos. Sin papeles, sin filas, sin "3 días hábiles". Si te
                                        aprobamos, tu wallet queda <strong>registrada on-chain en ambas redes</strong>{" "}
                                        automáticamente — auditable por cualquiera.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/borrow"
                                className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-black"
                            >
                                Probar ahora →
                            </Link>
                        </div>
                    </div>

                    {/* L1 callout */}
                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-black p-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/avax.svg" alt="Avalanche" className="h-full w-full object-contain" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold">
                                        <span className="text-red-600 dark:text-red-400">Aval L1</span> — nuestra blockchain dedicada en Avalanche
                                    </h3>
                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                        Configuramos una Subnet-EVM propia donde corren los mismos contratos que ves
                                        en Fuji. Es la base de v2: ahí vamos a habilitar gas en USDC y validators
                                        institucionales conforme onboardeamos partners.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/stats"
                                className="shrink-0 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-black"
                            >
                                Ver stats →
                            </Link>
                        </div>
                    </div>

                    <p className="mt-8 text-center text-xs text-zinc-500">
                        ¿Sos developer y querés ver el código?{" "}
                        <a
                            href="https://github.com/artugrande/aval"
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                            github.com/artugrande/aval
                        </a>
                    </p>
                </div>
            </section>

            {/* ───── CTA cards ───── */}
            <section className="border-t border-zinc-200 dark:border-zinc-800">
                <div className="mx-auto max-w-6xl px-6 py-20">
                    <div className="grid gap-6 sm:grid-cols-3">
                        <Card
                            title="Para lenders"
                            body="Depositá USDC en un pool ERC-4626. Recibí shares (avUSDC) que rinden por las fees cobradas a borrowers."
                            href="/lend"
                            cta="Ir a Lend"
                        />
                        <Card
                            title="Para PyMEs"
                            body="Conectá tu wallet y tomá préstamos a término en USDC. Tu cap crece automáticamente con cada repago."
                            href="/borrow"
                            cta="Ir a Borrow"
                        />
                        <Card
                            title="Stats del protocolo"
                            body="TVL, contratos y comparación entre Fuji C-Chain y Aval L1. Todo verificable on-chain."
                            href="/stats"
                            cta="Ver stats"
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

// ───── data ─────

const LEVELS = [
    {level: 1, cap: 100, fee: "5.00%", color: "from-zinc-400 to-zinc-300"},
    {level: 2, cap: 250, fee: "4.25%", color: "from-zinc-500 to-zinc-400"},
    {level: 3, cap: 500, fee: "3.50%", color: "from-zinc-500 to-zinc-400"},
    {level: 4, cap: 1_000, fee: "3.00%", color: "from-zinc-600 to-zinc-500"},
    {level: 5, cap: 2_000, fee: "2.50%", color: "from-zinc-600 to-zinc-500"},
    {level: 6, cap: 3_500, fee: "2.25%", color: "from-zinc-700 to-zinc-600"},
    {level: 7, cap: 5_500, fee: "2.00%", color: "from-zinc-700 to-zinc-600"},
    {level: 8, cap: 8_000, fee: "1.75%", color: "from-zinc-800 to-zinc-700"},
    {level: 9, cap: 11_000, fee: "1.50%", color: "from-zinc-800 to-zinc-700"},
    {level: 10, cap: 14_500, fee: "1.25%", color: "from-red-700 to-red-600"},
    {level: 11, cap: 20_000, fee: "1.00%", color: "from-red-600 to-red-500"},
];

// ───── components ─────

function CountryStat({flag, country, pct}: {flag: string; country: string; pct: string}) {
    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-baseline justify-between">
                <div className="text-2xl">{flag}</div>
                <div className="text-3xl font-semibold text-red-600 dark:text-red-400">{pct}</div>
            </div>
            <div className="mt-1 text-sm font-medium">{country}</div>
            <div className="text-xs text-zinc-500">sin acceso a crédito adecuado</div>
        </div>
    );
}

function LevelCard({level, cap, fee, color}: {level: number; cap: number; fee: string; color: string}) {
    return (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
                <span
                    className={`rounded-full bg-gradient-to-r ${color} px-2.5 py-0.5 text-xs font-bold text-white`}
                >
                    L{level}
                </span>
                <span className="text-xs text-zinc-500">{fee}</span>
            </div>
            <div className="mt-2 text-xl font-semibold">${cap.toLocaleString("en-US")}</div>
            <div className="text-xs text-zinc-500">USDC cap</div>
        </div>
    );
}

function Advantage({
    icon,
    iconImg,
    title,
    body,
}: {
    icon?: string;
    iconImg?: string;
    title: string;
    body: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            {iconImg ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={iconImg} alt="" className="h-8 w-8 object-contain" />
            ) : icon ? (
                <div className="text-2xl">{icon}</div>
            ) : null}
            <h3 className={`text-base font-semibold ${icon || iconImg ? "mt-2" : ""}`}>{title}</h3>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</div>
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
