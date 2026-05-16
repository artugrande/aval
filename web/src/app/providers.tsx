"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RainbowKitProvider, darkTheme} from "@rainbow-me/rainbowkit";
import {WagmiProvider} from "wagmi";

import "@rainbow-me/rainbowkit/styles.css";
import {wagmiConfig} from "@/lib/wagmi";
import {useState} from "react";

export function Providers({children}: {children: React.ReactNode}) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    modalSize="compact"
                    theme={darkTheme({
                        accentColor: "#E84142", // Avalanche red
                        borderRadius: "medium",
                    })}
                >
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
