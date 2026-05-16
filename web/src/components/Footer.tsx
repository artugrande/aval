"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

export function Footer() {
    const pathname = usePathname();
    // Hide the global footer inside the deck — it's a fullscreen presentation.
    if (pathname.startsWith("/deck")) return null;

    return (
        <footer className="footer-bar">
            <div className="container footer-inner">
                <div>
                    Aval — todos los derechos reservados 2026 — construido para la{" "}
                    <a
                        href="https://build.avax.network/events/8a8ee2e9-d91d-4087-adba-c1221b72e407"
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                    >
                        Hackathon LatAm Institucional · Avalanche 2026
                    </a>
                </div>
                <div style={{display: "flex", gap: 10, alignItems: "center"}}>
                    <Link className="x-link" href="/deck">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="14" rx="2" />
                            <line x1="3" y1="20" x2="21" y2="20" />
                        </svg>
                        <span>Ver pitch deck</span>
                    </Link>
                    <a
                        className="x-link"
                        href="https://x.com/ArtuGrande"
                        target="_blank"
                        rel="noreferrer"
                        aria-label="X — @ArtuGrande"
                    >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M18.244 2H21.5l-7.5 8.572L23 22h-6.844l-5.36-7.01L4.7 22H1.444l8.02-9.165L1 2h7.018l4.844 6.4L18.244 2zm-1.2 18h1.808L7.05 4h-1.9l11.894 16z" />
                        </svg>
                        <span>@ArtuGrande</span>
                    </a>
                </div>
            </div>
        </footer>
    );
}
