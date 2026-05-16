"use client";

import {useCallback, useEffect, useState} from "react";
import Link from "next/link";

const SLIDES = [
    "cover",
    "problema",
    "solucion",
    "como-funciona",
    "compliance",
    "usdc",
    "builder",
    "model",
    "thanks",
] as const;

const LEVELS = [
    {l: "L1", cap: "$100", rate: "5.00%"},
    {l: "L2", cap: "$250", rate: "4.25%"},
    {l: "L3", cap: "$500", rate: "3.50%"},
    {l: "L4", cap: "$1,000", rate: "3.00%"},
    {l: "L5", cap: "$2,000", rate: "2.50%"},
    {l: "L6", cap: "$3,500", rate: "2.25%"},
    {l: "L7", cap: "$5,500", rate: "2.00%"},
    {l: "L8", cap: "$8,000", rate: "1.75%"},
    {l: "L9", cap: "$11,000", rate: "1.50%"},
    {l: "L10", cap: "$14,500", rate: "1.25%", elite: true},
    {l: "L11", cap: "$20,000", rate: "1.00%", elite: true},
];

export default function DeckPage() {
    const [i, setI] = useState(0);
    const total = SLIDES.length;

    const next = useCallback(() => setI((v) => Math.min(total - 1, v + 1)), [total]);
    const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
    const go = useCallback((idx: number) => setI(Math.max(0, Math.min(total - 1, idx))), [total]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowRight":
                case "PageDown":
                case " ":
                    e.preventDefault();
                    if (e.shiftKey) prev();
                    else next();
                    break;
                case "ArrowLeft":
                case "PageUp":
                    e.preventDefault();
                    prev();
                    break;
                case "Home":
                    e.preventDefault();
                    go(0);
                    break;
                case "End":
                    e.preventDefault();
                    go(total - 1);
                    break;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [next, prev, go, total]);

    const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Click on dots/arrows handled separately; ignore those targets
        const target = e.target as HTMLElement;
        if (target.closest(".deck-nav-arrow") || target.closest(".deck-progress") || target.closest("a") || target.closest("button"))
            return;
        const x = e.clientX;
        const w = window.innerWidth;
        if (x < w / 2) prev();
        else next();
    };

    return (
        <div className="deck-root" onClick={onClick}>
            <div className="deck-track" style={{transform: `translateX(-${i * 100}%)`}}>
                <Slide>
                    <CoverSlide />
                </Slide>
                <Slide>
                    <ProblemSlide />
                </Slide>
                <Slide>
                    <SolutionSlide />
                </Slide>
                <Slide>
                    <HowSlide />
                </Slide>
                <Slide>
                    <ComplianceSlide />
                </Slide>
                <Slide>
                    <UsdcSlide />
                </Slide>
                <Slide>
                    <BuilderSlide />
                </Slide>
                <Slide>
                    <ModelSlide />
                </Slide>
                <Slide>
                    <ThanksSlide />
                </Slide>
            </div>

            {/* Nav arrows */}
            {i > 0 && (
                <button className="deck-nav-arrow left" onClick={prev} aria-label="Anterior" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
            )}
            {i < total - 1 && (
                <button className="deck-nav-arrow right" onClick={next} aria-label="Siguiente" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            )}

            {/* Hint */}
            <div className="deck-hint">← → para navegar · ESC vuelve al sitio</div>

            {/* Progress dots */}
            <div className="deck-progress">
                {SLIDES.map((_, idx) => (
                    <button
                        key={idx}
                        type="button"
                        className={`deck-dot ${idx === i ? "active" : ""}`}
                        onClick={() => go(idx)}
                        aria-label={`Ir a slide ${idx + 1}`}
                    />
                ))}
            </div>

            {/* Counter */}
            <div className="deck-counter">
                {String(i + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </div>

            {/* Back-to-site shortcut on Escape */}
            <EscClose />
        </div>
    );
}

function EscClose() {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                window.location.href = "/";
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    return null;
}

function Slide({children}: {children: React.ReactNode}) {
    return (
        <section className="deck-slide">
            <div className="inner">{children}</div>
        </section>
    );
}

// ─────────── slides ───────────

function CoverSlide() {
    return (
        <div className="deck-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/aval.svg" alt="Aval" />
            <h1>Aval</h1>
            <p className="tagline">
                Crédito global para <span style={{color: "var(--accent)"}}>PyMEs</span> de LatAm
            </p>
            <div className="deck-cover-stack">
                <span className="deck-cover-stack-l">Powered by</span>
                <div className="deck-cover-stack-row">
                    <span className="deck-cover-pill">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/claudelogo.png" alt="Claude" />
                        Claude
                    </span>
                    <span className="deck-cover-pill">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/avax.svg" alt="Avalanche" />
                        Avalanche
                    </span>
                    <span className="deck-cover-pill">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/wavynode-dark.svg" alt="WavyNode" />
                        WavyNode
                    </span>
                </div>
            </div>
        </div>
    );
}

function ProblemSlide() {
    return (
        <div>
            <div className="deck-eyebrow">El problema</div>
            <h1 className="deck-h1">
                LatAm tiene una brecha de financiamiento PyME de más de{" "}
                <span className="accent">US$100B</span>.
            </h1>
            <p className="deck-lead">
                Las PyMEs son el 99% de las empresas y generan más del 60% del empleo formal — pero millones siguen sin
                acceso a crédito adecuado.
            </p>
            <div className="deck-countries">
                {[
                    {flag: "🇲🇽", pct: "85%", name: "México"},
                    {flag: "🇦🇷", pct: "78%", name: "Argentina"},
                    {flag: "🇨🇴", pct: "76%", name: "Colombia"},
                    {flag: "🇵🇪", pct: "45%", name: "Perú"},
                ].map((c) => (
                    <div key={c.name} className="deck-country">
                        <div className="flag">{c.flag}</div>
                        <div className="pct">{c.pct}</div>
                        <div className="name">{c.name}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SolutionSlide() {
    const bullets = [
        {
            t: "Crédito sin colateral",
            d: "Las PyMEs piden USDC con su wallet, sin garantías ni avales tradicionales.",
        },
        {
            t: "Verificación con IA + AML on-chain",
            d: "Claude Haiku 4.5 revisa el Business Profile y WavyNode escanea la wallet en cadena, todo en <15s.",
        },
        {
            t: "Caps que crecen pagando",
            d: "Bootstrap de L1 ($100) a L11 ($20k) con cada repago a tiempo.",
        },
        {
            t: "Auditable on-chain",
            d: "Cada préstamo, repago y default vive en Avalanche — verificable por cualquiera.",
        },
    ];
    return (
        <div>
            <div className="deck-eyebrow">La solución</div>
            <h1 className="deck-h1">
                Aval conecta liquidez global con <span className="accent">PyMEs verificadas</span>.
            </h1>
            <div className="deck-bullets">
                {bullets.map((b) => (
                    <div className="deck-bullet" key={b.t}>
                        <div className="check">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                        <div>
                            <h4>{b.t}</h4>
                            <p>{b.d}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function HowSlide() {
    return (
        <div>
            <div className="deck-eyebrow">Cómo funciona</div>
            <h1 className="deck-h1">
                Tu cap arranca chico y <span className="accent">crece pagando</span>.
            </h1>
            <p className="deck-lead">
                Sin extractos bancarios, sin facturas, sin scoring opaco. La confianza se gana préstamo a préstamo.
            </p>
            <div className="deck-levels">
                {LEVELS.map((lv) => (
                    <div className={`deck-level${lv.elite ? " elite" : ""}`} key={lv.l}>
                        <div className="tag">{lv.l}</div>
                        <div className="cap">{lv.cap}</div>
                        <div className="rate">{lv.rate}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ComplianceSlide() {
    const stack = [
        {
            t: "AML on-chain",
            d: "Cada wallet pasa por scan-risk de WavyNode antes de que Claude apruebe. Score ≥ 60 o suspicious activity → reject automático.",
            icon: "🔍",
        },
        {
            t: "Monitoreo continuo",
            d: "Las wallets aprobadas quedan registradas para alertas en tiempo real sobre interacciones con direcciones flaggeadas.",
            icon: "📡",
        },
    ];
    return (
        <div>
            <div className="deck-eyebrow">Compliance stack</div>
            <h1 className="deck-h1">
                Compliance enterprise sin <span className="accent">las semanas de consultoría</span>.
            </h1>
            <p className="deck-lead">
                Integramos <strong style={{color: "var(--text)"}}>WavyNode</strong> — el rail de compliance regulatorio para
                payment providers crypto en LatAm — para cubrir AML on-chain y monitoreo continuo de las wallets aprobadas.
            </p>
            <div className="deck-compliance two">
                {stack.map((s) => (
                    <div className="deck-comp-card" key={s.t}>
                        <div className="ico">{s.icon}</div>
                        <h4>{s.t}</h4>
                        <p>{s.d}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function UsdcSlide() {
    return (
        <div>
            <div className="deck-eyebrow">USDC en Aval L1</div>
            <h1 className="deck-h1">
                Cómo llega <span className="accent">USDC real</span> a nuestra L1.
            </h1>
            <p className="deck-lead">
                Aval L1 es una Subnet-EVM en Avacloud — el USDC canonical de Circle vive en C-Chain. Tenemos un path
                claro para mover liquidez sin reinventar la rueda.
            </p>
            <div className="deck-usdc">
                <div className="deck-usdc-card current">
                    <div className="stage">
                        <span className="tag">v1 · Hoy</span>
                        <span className="status">Live en testnet</span>
                    </div>
                    <h4>
                        <span className="mono">mUSDC</span> nativo en ambas chains
                    </h4>
                    <p>
                        MockUSDC con faucet público corriendo simultáneamente en Avalanche Fuji y Aval L1. Mismo
                        ABI, misma economía, gas pagado en AVAX / AVL. Permite demo end-to-end sin depender de
                        bridges externos durante el período de testing.
                    </p>
                    <div className="deck-usdc-flow mono">
                        Fuji USDC.faucet() · L1 USDC.faucet() → independientes
                    </div>
                </div>

                <div className="deck-usdc-card next">
                    <div className="stage">
                        <span className="tag accent">v2 · Roadmap</span>
                        <span className="status">Avalanche-native</span>
                    </div>
                    <h4>
                        Avalanche <span className="accent">ICTT</span> (Interchain Token Transfer)
                    </h4>
                    <p>
                        <span className="mono">TokenSource</span> en C-Chain locks canonical USDC,{" "}
                        <span className="mono">TokenDestination</span> en Aval L1 mints <span className="mono">bUSDC.e</span>.
                        Routing vía Teleporter — ya pre-deployado en cada Avacloud subnet. Es el primitivo oficial
                        que usa toda subnet seria del ecosistema (Beam, DFK, Lamina1).
                    </p>
                    <div className="deck-usdc-flow mono">
                        C-Chain TokenSource.send() → Teleporter → L1 TokenDestination.mint()
                    </div>
                </div>
            </div>
        </div>
    );
}

function BuilderSlide() {
    return (
        <div>
            <div className="deck-eyebrow">About the builder</div>
            <div className="deck-builder">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/profile.jpg" alt="Arturo Grande" />
                <div className="info">
                    <h1 className="deck-h1" style={{fontSize: "clamp(36px, 5vw, 56px)"}}>
                        Arturo Grande
                    </h1>
                    <p>
                        <strong>Product &amp; Marketing</strong> para startups web3 desde 2022. Escalé una fintech de{" "}
                        <strong>$5M a $65M USD</strong> procesados en 3 años.
                    </p>
                    <p>
                        Gané <strong>9 hackathons</strong> (Celo, Polkadot, ETHGlobal, Avalanche, GenLayer, Worldcoin,
                        Stellar) y conduzco un <strong>podcast de tecnología con +250k reproducciones</strong> en
                        Spotify y YouTube.
                    </p>
                    <p>
                        Founder de <strong>desafia.tech</strong> — plataforma educativa que enseña a programar con IA.
                    </p>
                    <div className="links">
                        <a className="builder-icon" href="https://x.com/ArtuGrande" target="_blank" rel="noreferrer" aria-label="X">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.572L23 22h-6.844l-5.36-7.01L4.7 22H1.444l8.02-9.165L1 2h7.018l4.844 6.4L18.244 2zm-1.2 18h1.808L7.05 4h-1.9l11.894 16z"/></svg>
                        </a>
                        <a className="builder-icon" href="https://www.linkedin.com/in/arturo-grande/" target="_blank" rel="noreferrer" aria-label="LinkedIn">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                        <a className="builder-icon" href="https://www.youtube.com/@artugrande" target="_blank" rel="noreferrer" aria-label="YouTube">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        </a>
                        <a className="builder-icon" href="https://open.spotify.com/show/3nMj6xYsjwIvofrWg2IvIA" target="_blank" rel="noreferrer" aria-label="Spotify">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.959-.539-.12-.421.18-.84.54-.96 4.561-1.021 8.52-.6 11.64 1.32.42.18.479.659.361 1.08zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ModelSlide() {
    return (
        <div>
            <div className="deck-eyebrow">Modelo de negocio</div>
            <h1 className="deck-h1">
                Sostenible desde el <span className="accent">día uno</span>.
            </h1>
            <p className="deck-lead">
                Cobramos un <strong style={{color: "var(--text)"}}>15% sobre las fees</strong> de repago. El 85% va a
                lenders como yield. Sin costo de capital, sin originación bancaria, sin riesgo en libros — solo el
                spread.
            </p>
            <div className="deck-model">
                <div>
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24}}>
                        <div className="split">
                            <div className="split-v">85%</div>
                            <div className="split-l">Para lenders</div>
                            <div className="split-sub">Va al pool como yield</div>
                        </div>
                        <div className="split">
                            <div className="split-v accent">15%</div>
                            <div className="split-l">Protocolo</div>
                            <div className="split-sub">Financia desarrollo</div>
                        </div>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th className="num">Take</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="aval">
                            <td>Aval</td>
                            <td className="num">15%</td>
                        </tr>
                        <tr>
                            <td>Konfio · Creditas</td>
                            <td className="num">20–35%</td>
                        </tr>
                        <tr>
                            <td>Bancos LatAm</td>
                            <td className="num">30–50%+</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ThanksSlide() {
    return (
        <div className="deck-thanks">
            <h1>
                ¡Gracias!
            </h1>
            <p className="sub">Aval — crédito global para PyMEs de LatAm.</p>
            <div className="links">
                <Link className="btn btn-primary" href="/">
                    Ver demo <span className="arr">→</span>
                </Link>
                <a className="btn btn-ghost" href="https://github.com/artugrande/aval" target="_blank" rel="noreferrer">
                    GitHub <span className="arr">→</span>
                </a>
                <a className="btn btn-ghost" href="https://x.com/ArtuGrande" target="_blank" rel="noreferrer">
                    @ArtuGrande <span className="arr">→</span>
                </a>
            </div>
        </div>
    );
}
