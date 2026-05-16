import type {Metadata} from "next";
import {Geist_Mono, Space_Grotesk} from "next/font/google";

import "./globals.css";
import {Providers} from "./providers";
import {Header} from "@/components/Header";

const grotesk = Space_Grotesk({
    variable: "--font-sans",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Aval — Credit for LatAm SMEs",
    description: "Uncollateralized USDC credit lines for Latin American SMEs on Avalanche.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
    return (
        <html lang="en" className={`${grotesk.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col">
                <Providers>
                    <Header />
                    <div className="flex-1">{children}</div>
                    <footer className="border-t border-zinc-200 px-6 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
                        Aval — todos los derechos reservados 2026 — construido para la{" "}
                        <a
                            href="https://build.avax.network/events/8a8ee2e9-d91d-4087-adba-c1221b72e407"
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                        >
                            Hackathon LatAm Institucional · Avalanche 2026
                        </a>
                    </footer>
                </Providers>
            </body>
        </html>
    );
}
