import type {Metadata} from "next";
import {Inter, JetBrains_Mono} from "next/font/google";

import "./globals.css";
import {Providers} from "./providers";
import {Header} from "@/components/Header";

const inter = Inter({
    variable: "--font-sans",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
});

export const metadata: Metadata = {
    title: "Aval — Credit for LatAm SMEs",
    description: "Uncollateralized USDC credit lines for Latin American SMEs on Avalanche.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
    return (
        <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col">
                <Providers>
                    <Header />
                    <div className="flex-1">{children}</div>
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
                    </footer>
                </Providers>
            </body>
        </html>
    );
}
