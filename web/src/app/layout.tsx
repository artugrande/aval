import type {Metadata} from "next";
import {Inter, JetBrains_Mono} from "next/font/google";

import "./globals.css";
import {Providers} from "./providers";
import {Header} from "@/components/Header";
import {Footer} from "@/components/Footer";

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
    icons: {
        icon: [{url: "/faviconaval.png", type: "image/png"}],
        apple: [{url: "/faviconaval.png"}],
    },
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
    return (
        <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col">
                <Providers>
                    <Header />
                    <div className="flex-1">{children}</div>
                    <Footer />
                </Providers>
            </body>
        </html>
    );
}
