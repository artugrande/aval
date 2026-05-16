"use client";

import Link from "next/link";
import {ConnectButton} from "@rainbow-me/rainbowkit";
import {usePathname} from "next/navigation";

const links = [
    {href: "/lend", label: "Lend"},
    {href: "/borrow", label: "Borrow"},
    {href: "/stats", label: "Stats"},
];

export function Header() {
    const pathname = usePathname();
    // Hide the global nav inside the deck — fullscreen presentation.
    if (pathname.startsWith("/deck")) return null;
    return (
        <nav className="top">
            <div className="container inner">
                <Link href="/" className="brand" aria-label="Aval — home">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/aval.svg" alt="" />
                    <span>Aval</span>
                </Link>
                <div className="nav-links">
                    {links.map((l) => {
                        const active = pathname === l.href;
                        return (
                            <Link key={l.href} href={l.href} className={active ? "active" : ""}>
                                {l.label}
                            </Link>
                        );
                    })}
                </div>
                <div className="nav-right">
                    <ConnectButton.Custom>
                        {({account, chain, openAccountModal, openChainModal, openConnectModal, mounted}) => {
                            const ready = mounted;
                            const connected = ready && account && chain;
                            if (!ready) return null;
                            if (!connected) {
                                return (
                                    <button className="pill" onClick={openConnectModal} type="button">
                                        <span className="dot" />
                                        Conectar wallet
                                    </button>
                                );
                            }
                            if (chain.unsupported) {
                                return (
                                    <button className="pill" onClick={openChainModal} type="button" style={{borderColor: "var(--accent)"}}>
                                        <span className="dot" />
                                        Red incorrecta
                                    </button>
                                );
                            }
                            return (
                                <>
                                    <button className="pill" onClick={openChainModal} type="button">
                                        <span className="dot" />
                                        {chain.name}
                                        <span className="caret">▾</span>
                                    </button>
                                    <button className="pill" onClick={openAccountModal} type="button">
                                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 12V8H6a2 2 0 010-4h12v4" />
                                            <path d="M4 6v12a2 2 0 002 2h14v-4" />
                                            <path d="M18 12a2 2 0 000 4h4v-4z" />
                                        </svg>
                                        <span className="mono">{account.displayName}</span>
                                        <span className="caret">▾</span>
                                    </button>
                                </>
                            );
                        }}
                    </ConnectButton.Custom>
                </div>
            </div>
        </nav>
    );
}
