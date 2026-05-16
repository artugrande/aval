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
    return (
        <header className="border-b border-zinc-200 dark:border-zinc-800">
            <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-8">
                    <Link href="/" className="text-2xl font-bold tracking-tight">
                        Aval
                    </Link>
                    <nav className="flex items-center gap-5 text-sm">
                        {links.map((l) => {
                            const active = pathname === l.href;
                            return (
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    className={
                                        active
                                            ? "font-medium text-zinc-900 dark:text-zinc-100"
                                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                    }
                                >
                                    {l.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
                <ConnectButton showBalance={false} chainStatus="icon" />
            </div>
        </header>
    );
}
