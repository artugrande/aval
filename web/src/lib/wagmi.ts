import {connectorsForWallets} from "@rainbow-me/rainbowkit";
import {
    coinbaseWallet,
    injectedWallet,
    metaMaskWallet,
    rabbyWallet,
    rainbowWallet,
    walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import {createConfig, http} from "wagmi";
import {avalancheFuji} from "wagmi/chains";

// Fuji testnet only for v1. Mainnet Avalanche + a custom L1 are roadmap.
export const supportedChains = [avalancheFuji] as const;

// WalletConnect Cloud projectId. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in env.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "aval-demo-placeholder";

const connectors = connectorsForWallets(
    [
        {
            groupName: "Recomendadas",
            wallets: [metaMaskWallet, rabbyWallet, walletConnectWallet, coinbaseWallet, rainbowWallet],
        },
        {
            groupName: "Otras",
            wallets: [injectedWallet],
        },
    ],
    {
        appName: "Aval",
        projectId,
    },
);

export const wagmiConfig = createConfig({
    chains: supportedChains,
    connectors,
    ssr: true,
    transports: {
        [avalancheFuji.id]: http(),
    },
});

declare module "wagmi" {
    interface Register {
        config: typeof wagmiConfig;
    }
}
