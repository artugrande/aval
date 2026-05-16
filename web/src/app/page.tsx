"use client";

import Link from "next/link";
import {useEffect, useRef} from "react";

import {HeroShader} from "@/components/HeroShader";
import {PoolMetrics} from "@/components/PoolMetrics";

interface Level {
    l: string;
    rate: string;
    cap: string;
    elite?: boolean;
}

const LEVELS: Level[] = [
    {l: "L1", rate: "5.00%", cap: "$100"},
    {l: "L2", rate: "4.25%", cap: "$250"},
    {l: "L3", rate: "3.50%", cap: "$500"},
    {l: "L4", rate: "3.00%", cap: "$1,000"},
    {l: "L5", rate: "2.50%", cap: "$2,000"},
    {l: "L6", rate: "2.25%", cap: "$3,500"},
    {l: "L7", rate: "2.00%", cap: "$5,500"},
    {l: "L8", rate: "1.75%", cap: "$8,000"},
    {l: "L9", rate: "1.50%", cap: "$11,000"},
    {l: "L10", rate: "1.25%", cap: "$14,500", elite: true},
    {l: "L11", rate: "1.00%", cap: "$20,000", elite: true},
];

const RIBBON_ITEMS = [
    "ERC-4626 POOL",
    "AVALANCHE SUBNET-EVM",
    "CLAUDE HAIKU 4.5",
    "L1 → L11 CREDIT TIERS",
    "AUDITABLE ON-CHAIN",
];

export default function Home() {
    const containerRef = useRef<HTMLDivElement>(null);

    // Hook up all the interactivity (reveal-on-scroll, counters, tilt, spotlight, smooth scroll).
    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add("in");
                        io.unobserve(e.target);
                    }
                });
            },
            {threshold: 0.12},
        );
        root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
        root.querySelectorAll(".level-card").forEach((el) => io.observe(el));

        // Country % counters
        const cio = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (!e.isIntersecting) return;
                    const el = e.target as HTMLElement;
                    const target = parseFloat(el.dataset.pct ?? "0");
                    const dur = 1400;
                    const t0 = performance.now();
                    const step = (now: number) => {
                        const t = Math.min(1, (now - t0) / dur);
                        const eased = 1 - Math.pow(1 - t, 3);
                        el.textContent = Math.round(target * eased) + "%";
                        if (t < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                    cio.unobserve(el);
                });
            },
            {threshold: 0.5},
        );
        root.querySelectorAll<HTMLElement>("[data-pct]").forEach((el) => cio.observe(el));

        // Hero stat counters — fire on a small delay so the hero title animation lands first.
        type CounterCfg = {sel: string; from: number; to: number; fmt: (v: number) => string};
        const hcounts: CounterCfg[] = [
            {sel: "[data-counter='100']", from: 0, to: 100, fmt: (v) => "$" + Math.round(v) + "B"},
            {sel: "[data-counter='11']", from: 0, to: 11, fmt: (v) => "L" + Math.round(v)},
            {sel: "[data-counter='15']", from: 0, to: 15, fmt: (v) => Math.round(v) + "s"},
        ];
        hcounts.forEach((c) => {
            const el = root.querySelector<HTMLElement>(c.sel);
            if (!el) return;
            const dur = 1800;
            const t0 = performance.now() + 1500;
            const step = (now: number) => {
                if (now < t0) {
                    requestAnimationFrame(step);
                    return;
                }
                const t = Math.min(1, (now - t0) / dur);
                const eased = 1 - Math.pow(1 - t, 3);
                el.textContent = c.fmt(c.from + (c.to - c.from) * eased);
                if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });

        // Spotlight that follows cursor (sets --mx/--my CSS vars on the hovered card)
        const spotEls = root.querySelectorAll<HTMLElement>(
            ".feature-card, .country-card, .level-card, .promo-card, .cta-card",
        );
        const onSpotMove = (e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            const r = el.getBoundingClientRect();
            el.style.setProperty("--mx", e.clientX - r.left + "px");
            el.style.setProperty("--my", e.clientY - r.top + "px");
        };
        spotEls.forEach((el) => el.addEventListener("mousemove", onSpotMove));

        // 3D tilt on country + promo cards
        const tiltEls = root.querySelectorAll<HTMLElement>("[data-tilt]");
        const onTiltMove = (e: MouseEvent) => {
            const el = e.currentTarget as HTMLElement;
            const r = el.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            el.style.transform = `translateY(-4px) perspective(900px) rotateX(${-py * 4}deg) rotateY(${px * 5}deg)`;
        };
        const onTiltLeave = (e: MouseEvent) => {
            (e.currentTarget as HTMLElement).style.transform = "";
        };
        tiltEls.forEach((el) => {
            el.addEventListener("mousemove", onTiltMove);
            el.addEventListener("mouseleave", onTiltLeave);
        });

        return () => {
            io.disconnect();
            cio.disconnect();
            spotEls.forEach((el) => el.removeEventListener("mousemove", onSpotMove));
            tiltEls.forEach((el) => {
                el.removeEventListener("mousemove", onTiltMove);
                el.removeEventListener("mouseleave", onTiltLeave);
            });
        };
    }, []);

    return (
        <div ref={containerRef}>
            {/* ===== Hero ===== */}
            <section className="hero">
                <HeroShader />
                <div className="grain" />
                <div className="vignette" />
                <div className="hero-content">
                    <div className="eyebrow">
                        <span className="live" /> Live en Aval L1 · Fuji C-Chain
                    </div>
                    <h1 className="hero-title">
                        <span className="word" style={{animationDelay: ".05s"}}>
                            Crédito
                        </span>{" "}
                        <span className="word" style={{animationDelay: ".15s"}}>
                            <span className="accent">global</span>
                        </span>{" "}
                        <span className="word" style={{animationDelay: ".25s"}}>
                            para
                        </span>
                        <br />
                        <span className="word" style={{animationDelay: ".35s"}}>
                            <span className="accent">PyMEs</span>
                        </span>{" "}
                        <span className="word" style={{animationDelay: ".45s"}}>
                            de
                        </span>{" "}
                        <span className="word" style={{animationDelay: ".55s"}}>
                            LatAm.
                        </span>
                    </h1>
                    <p className="hero-sub">
                        Accedé a financiamiento en dólares digitales de forma rápida, transparente y sin depender de
                        bancos tradicionales.
                    </p>
                    <div className="hero-ctas">
                        <Link className="btn btn-primary" href="/lend">
                            Prestar USDC <span className="arr">→</span>
                        </Link>
                        <Link className="btn btn-ghost" href="/borrow">
                            Solicitar crédito <span className="arr">→</span>
                        </Link>
                    </div>

                    <div className="hero-stats">
                        <div className="hero-stat">
                            <div className="v mono" data-counter="100">
                                $0B
                            </div>
                            <div className="l">Brecha PyME LatAm</div>
                        </div>
                        <div className="hero-stat">
                            <div className="v mono" data-counter="11">
                                L0
                            </div>
                            <div className="l">Niveles de crédito</div>
                        </div>
                        <div className="hero-stat">
                            <div className="v mono" data-counter="15">
                                0s
                            </div>
                            <div className="l">Verificación IA</div>
                        </div>
                        <div className="hero-stat">
                            <div className="v">24/7</div>
                            <div className="l">On-chain</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== Marquee ===== */}
            <div className="ribbon">
                <div className="ribbon-track">
                    {[...RIBBON_ITEMS, ...RIBBON_ITEMS].map((item, i) => (
                        <span className="ribbon-item" key={i}>
                            <span className="pip" />
                            {item}
                        </span>
                    ))}
                </div>
            </div>

            {/* ===== Problem ===== */}
            <section id="problem" className="landing">
                <div className="container">
                    <div className="reveal">
                        <div className="eyebrow-2">El problema</div>
                        <h2 className="section-title">
                            LatAm tiene una brecha de financiamiento PyME de más de{" "}
                            <span className="accent">US$100B</span>.
                        </h2>
                        <p className="section-lead">
                            Las PyMEs representan casi el 99% de las empresas de la región y generan más del 60% del
                            empleo formal — pero millones siguen sin acceso a crédito adecuado.
                        </p>
                    </div>

                    <div className="country-grid">
                        <CountryCard flag="🇲🇽" pct={85} name="México" delay={0.05} />
                        <CountryCard flag="🇦🇷" pct={78} name="Argentina" delay={0.12} />
                        <CountryCard flag="🇨🇴" pct={76} name="Colombia" delay={0.19} />
                        <CountryCard flag="🇵🇪" pct={45} name="Perú" delay={0.26} />
                    </div>
                    <div className="country-foot reveal">
                        Porcentaje de negocios que enfrentan dificultades para acceder a financiamiento o crédito
                        formal.
                    </div>
                </div>
            </section>

            {/* ===== How it works ===== */}
            <section id="how" className="landing">
                <div className="container">
                    <div className="reveal">
                        <div className="eyebrow-2">Cómo funciona Aval</div>
                        <h2 className="section-title">Tu cap arranca chico y crece pagando.</h2>
                        <p className="section-lead">
                            Sin extractos bancarios, sin facturas, sin scoring opaco. Cada PyME arranca en{" "}
                            <strong style={{color: "var(--text)"}}>L1 con un cap de $100 USDC</strong>. Cada préstamo
                            repagado a tiempo te sube de nivel, hasta $20,000 en L11. La tasa baja a medida que tu
                            nivel sube — menos riesgo, mejor precio.
                        </p>
                    </div>

                    <div className="levels-wrap reveal">
                        <div className="levels-grid">
                            {LEVELS.map((lv, i) => (
                                <div
                                    key={lv.l}
                                    className={`level-card${lv.elite ? " elite" : ""}`}
                                    style={
                                        {
                                            "--p": ((i + 1) / LEVELS.length).toString(),
                                            "--d": `${i * 0.06}s`,
                                        } as React.CSSProperties
                                    }
                                >
                                    <div className="level-row">
                                        <span className="level-tag">{lv.l}</span>
                                        <span className="level-rate mono">{lv.rate}</span>
                                    </div>
                                    <div className="level-cap">{lv.cap}</div>
                                    <div className="level-cap-l">USDC cap</div>
                                    <div className="level-bar" />
                                </div>
                            ))}
                        </div>
                        <div className="levels-foot">
                            Default → L0 + blacklist. La economía hace el resto: el costo de crear wallet + KYB +
                            perder $100 supera lo que un atacante puede sacar al inicio. La confianza se gana préstamo
                            a préstamo.
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== Why different ===== */}
            <section id="why" className="landing">
                <div className="container">
                    <div className="reveal">
                        <div className="eyebrow-2">Por qué Aval es distinto</div>
                        <h2 className="section-title">Pensado para PyMEs de LatAm, no para bancos tradicionales.</h2>
                        <p className="section-lead">
                            Construimos nuestra propia infraestructura financiera sobre Avalanche para ofrecer una
                            experiencia más rápida, transparente y predecible desde el día uno.
                        </p>
                    </div>

                    <div className="features-grid">
                        <FeatureCard
                            iconImg="/usdclogo.png"
                            title="Todo en dólares digitales"
                            body={
                                <>
                                    <p>Operás en USDC de punta a punta: préstamos, repagos y comisiones.</p>
                                    <p className="note">Simple, transparente y estable desde el primer día.</p>
                                </>
                            }
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 20V10M10 20V4M16 20V14M22 20H2" />
                                </svg>
                            }
                            title="Costos transparentes"
                            body={
                                <>
                                    <p>Antes de aceptar un préstamo ves exactamente:</p>
                                    <ul>
                                        <li>cuánto recibís,</li>
                                        <li>cuánto devolvés,</li>
                                        <li>y cuándo.</li>
                                    </ul>
                                    <p className="note">
                                        Sin letra chica. Sin cargos sorpresa. Sin tasas que cambian después.
                                    </p>
                                </>
                            }
                            delay={0.06}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
                                </svg>
                            }
                            title="Operaciones en segundos"
                            body={
                                <>
                                    <p>No dependemos de horarios bancarios ni procesos manuales.</p>
                                    <p className="note">Las operaciones se procesan en segundos, 24/7.</p>
                                </>
                            }
                            delay={0.12}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="7" />
                                    <path d="M21 21l-4.35-4.35" />
                                </svg>
                            }
                            title="Transparencia verificable"
                            body={
                                <>
                                    <p>
                                        Cada préstamo y cada repago quedan registrados en una infraestructura pública y
                                        auditable.
                                    </p>
                                    <p className="note">
                                        Vos, un auditor o incluso tu contador pueden verificar toda la actividad en
                                        tiempo real.
                                    </p>
                                </>
                            }
                            delay={0.05}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 17 9 11 13 15 21 7" />
                                    <polyline points="15 7 21 7 21 13" />
                                </svg>
                            }
                            title="Tu reputación financiera te pertenece"
                            body={
                                <>
                                    <p>Cada préstamo repagado construye historial y aumenta tu acceso a capital.</p>
                                    <p className="note">
                                        Tu reputación no queda encerrada en un solo banco o institución.
                                    </p>
                                </>
                            }
                            delay={0.11}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="9" />
                                    <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
                                </svg>
                            }
                            title="Diseñado para LatAm"
                            body={
                                <>
                                    <p>Construido desde el día uno para empresas de:</p>
                                    <ul>
                                        <li>🇲🇽 México</li>
                                        <li>🇦🇷 Argentina</li>
                                        <li>🇨🇴 Colombia</li>
                                        <li>🇵🇪 Perú</li>
                                        <li>y el resto de la región.</li>
                                    </ul>
                                </>
                            }
                            delay={0.17}
                        />
                    </div>
                </div>
            </section>

            {/* ===== For lenders ===== */}
            <section id="lenders" className="landing">
                <div className="container">
                    <div className="reveal">
                        <div className="eyebrow-2">Para lenders</div>
                        <h2 className="section-title">Yield transparente. Riesgo verificable.</h2>
                        <p className="section-lead">
                            Construido para que veas exactamente cómo se genera tu rendimiento y dónde está tu plata —
                            sin promesas, sin caja negra, sin tokens de incentivo inflados.
                        </p>
                    </div>

                    <PoolMetrics />

                    <div className="features-grid">
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="20" x2="12" y2="4" />
                                    <polyline points="6 10 12 4 18 10" />
                                </svg>
                            }
                            title="Yield del pool real"
                            body={
                                <>
                                    <p>
                                        Tu rendimiento son las fees que pagan los borrowers — entre <strong>1% y 5%</strong>{" "}
                                        por préstamo a término. El pool acumula fees → tus shares <span className="mono">avUSDC</span>{" "}
                                        valen más con el tiempo.
                                    </p>
                                    <p className="note">Sin yield prometido. Sin caja negra. Solo flujo real de repagos.</p>
                                </>
                            }
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    <polyline points="9 12 11 14 15 10" />
                                </svg>
                            }
                            title="Gate de IA antes de cada préstamo"
                            body={
                                <>
                                    <p>
                                        Ningún borrower toca tu liquidez sin pasar por la revisión KYB con Claude Haiku 4.5.
                                    </p>
                                    <p className="note">
                                        La aprobación queda en el <span className="mono">BorrowerRegistry</span>{" "}
                                        on-chain — auditable por vos en tiempo real.
                                    </p>
                                </>
                            }
                            delay={0.06}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 21V13M9 21V9M15 21V5M21 21V1" />
                                </svg>
                            }
                            title="Caps que crecen con repagos"
                            body={
                                <>
                                    <p>
                                        Los borrowers nuevos arrancan con <strong>$100 USDC</strong> de cap. Solo llegan a $20k
                                        tras 10 préstamos repagados a tiempo.
                                    </p>
                                    <p className="note">
                                        Tu mayor exposición pro-rata es a wallets con historial probado.
                                    </p>
                                </>
                            }
                            delay={0.12}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" />
                                    <path d="M7 11V7a5 5 0 0110 0v4" />
                                </svg>
                            }
                            title="Sybil-resistant por economía"
                            body={
                                <>
                                    <p>
                                        Crear wallet + pasar KYB + perder $100 no le compensa a ningún atacante en L1.
                                    </p>
                                    <p className="note">
                                        Un default = <span className="mono">L0</span> + blacklist permanente on-chain. La
                                        wallet queda quemada para siempre.
                                    </p>
                                </>
                            }
                            delay={0.05}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            }
                            title="Auditable en tiempo real"
                            body={
                                <>
                                    <p>
                                        Cada préstamo, repago y default queda registrado en una infraestructura pública
                                        que vos podés revisar.
                                    </p>
                                    <p className="note">
                                        Snowtrace muestra cada operación en Avalanche Fuji. Sin gestores opacos.
                                    </p>
                                </>
                            }
                            delay={0.11}
                        />
                        <FeatureCard
                            iconSvg={
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                            }
                            title="Sin lockup, retiro a demanda"
                            body={
                                <>
                                    <p>
                                        Tu USDC vive en un pool ERC-4626 standard. Quemás shares → retirás USDC al instante.
                                    </p>
                                    <p className="note">
                                        Sujeto a utilization del pool (los fondos prestados se liberan al repago).
                                    </p>
                                </>
                            }
                            delay={0.17}
                        />
                    </div>

                    <p className="levels-foot" style={{textAlign: "center", marginLeft: "auto", marginRight: "auto"}}>
                        <strong style={{color: "var(--text)"}}>Riesgo real:</strong> si un borrower no paga, esa pérdida se
                        reparte entre todos los lenders del pool. No te prometemos un rendimiento fijo. Podés ver en
                        tiempo real cuánto rinde el pool y cuántos préstamos no se pagaron en{" "}
                        <Link href="/stats" style={{color: "var(--accent)", textDecoration: "underline"}}>
                            /stats
                        </Link>
                        , en vivo.
                    </p>
                </div>
            </section>

            {/* ===== Promo cards (Claude / Avalanche) ===== */}
            <section id="partners" className="landing">
                <div className="container">
                    <div className="promo-grid">
                        <div className="promo-card reveal" data-tilt>
                            <div className="glow a" />
                            <div className="glow b" />
                            <div className="partner">
                                <div className="partner-logo">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/claudelogo.png" alt="Claude" />
                                </div>
                                <div className="partner-name">Claude (Anthropic)</div>
                            </div>
                            <h3>
                                Verificación con <span className="accent">IA en segundos</span>, no semanas
                            </h3>
                            <p>
                                Tu Business Profile lo revisa Claude Haiku 4.5 de Anthropic en menos de 15 segundos.
                                Sin papeles, sin filas, sin "3 días hábiles". Si te aprobamos, tu wallet queda
                                registrada on-chain en ambas redes automáticamente — auditable por cualquiera.
                            </p>
                            <Link className="promo-link" href="/borrow">
                                Probar ahora →
                            </Link>
                        </div>

                        <div
                            className="promo-card reveal"
                            data-tilt
                            style={{transitionDelay: ".08s"}}
                        >
                            <div className="glow a" />
                            <div className="partner">
                                <div className="partner-logo" style={{background: "#e84142"}}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/avax.svg"
                                        alt="Avalanche"
                                        style={{padding: "8px", filter: "brightness(0) invert(1)"}}
                                    />
                                </div>
                                <div className="partner-name">Avalanche</div>
                            </div>
                            <h3>
                                <span className="accent">Aval L1</span> — nuestra blockchain dedicada en Avalanche
                            </h3>
                            <p>
                                Configuramos una Subnet-EVM propia donde corren los mismos contratos que ves en Fuji.
                                Es la base de v2: ahí vamos a habilitar gas en USDC y validators institucionales
                                conforme onboardeamos partners.
                            </p>
                            <Link className="promo-link" href="/stats">
                                Ver stats →
                            </Link>
                        </div>
                    </div>

                    <div className="promo-foot">
                        ¿Sos developer y querés ver el código?{" "}
                        <a href="https://github.com/artugrande/aval" target="_blank" rel="noreferrer">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.18-.02-2.14-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.67 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.17a11 11 0 015.8 0c2.2-1.48 3.17-1.17 3.17-1.17.63 1.58.23 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.66.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .3.21.67.8.55C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
                            </svg>
                            github.com/artugrande/aval
                        </a>
                    </div>
                </div>
            </section>

            {/* ===== Final CTAs ===== */}
            <section id="cta" className="landing">
                <div className="container">
                    <div className="cta-grid">
                        <Link className="cta-card reveal" href="/lend">
                            <h4>Para lenders</h4>
                            <p>
                                Depositá USDC en un pool ERC-4626. Recibí shares (avUSDC) que rinden por las fees
                                cobradas a borrowers.
                            </p>
                            <span className="go">
                                Ir a Lend <span className="arr">→</span>
                            </span>
                        </Link>
                        <Link className="cta-card reveal" href="/borrow" style={{transitionDelay: ".07s"}}>
                            <h4>Para PyMEs</h4>
                            <p>
                                Conectá tu wallet y tomá préstamos a término en USDC. Tu cap crece automáticamente con
                                cada repago.
                            </p>
                            <span className="go">
                                Ir a Borrow <span className="arr">→</span>
                            </span>
                        </Link>
                        <Link className="cta-card reveal" href="/stats" style={{transitionDelay: ".14s"}}>
                            <h4>Stats del protocolo</h4>
                            <p>
                                TVL, contratos y comparación entre Fuji C-Chain y Aval L1. Todo verificable on-chain.
                            </p>
                            <span className="go">
                                Ver stats <span className="arr">→</span>
                            </span>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}

// ───── pieces ─────

function CountryCard({flag, pct, name, delay}: {flag: string; pct: number; name: string; delay: number}) {
    return (
        <div className="country-card reveal" data-tilt style={{transitionDelay: `${delay}s`}}>
            <div className="flag">{flag}</div>
            <div className="pct" data-pct={pct}>
                0%
            </div>
            <div className="name">{name}</div>
            <div className="note">sin acceso a crédito adecuado</div>
        </div>
    );
}

function FeatureCard({
    iconImg,
    iconSvg,
    title,
    body,
    delay,
}: {
    iconImg?: string;
    iconSvg?: React.ReactNode;
    title: string;
    body: React.ReactNode;
    delay?: number;
}) {
    return (
        <div className="feature-card reveal" data-spot style={delay ? {transitionDelay: `${delay}s`} : undefined}>
            <div className="feature-icon">
                {iconImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={iconImg} alt="" />
                ) : (
                    iconSvg
                )}
            </div>
            <h3>{title}</h3>
            {body}
        </div>
    );
}
