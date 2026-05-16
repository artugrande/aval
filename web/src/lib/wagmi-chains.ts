import {defineChain} from "viem";

/**
 * Aval L1 — Subnet-EVM running on Avacloud (managed). RPC URL comes from env
 * (NEXT_PUBLIC_AVAL_L1_RPC). The chainId comes from env too because Avacloud
 * auto-assigns one — we capture it after deploy.
 *
 * Until both env vars are set, this chain definition is technically present in
 * the wagmi config but unusable. Components gracefully render "not deployed".
 */
const L1_CHAIN_ID = Number(process.env.NEXT_PUBLIC_AVAL_L1_CHAIN_ID ?? "6043");
const L1_RPC = process.env.NEXT_PUBLIC_AVAL_L1_RPC ?? "https://placeholder.invalid";
const L1_EXPLORER = process.env.NEXT_PUBLIC_AVAL_L1_EXPLORER ?? "https://explorer-test.avax.network";

export const avalL1 = defineChain({
    id: L1_CHAIN_ID,
    name: "Aval L1",
    nativeCurrency: {decimals: 18, name: "AVL Token", symbol: "AVL"},
    rpcUrls: {default: {http: [L1_RPC]}},
    blockExplorers: {default: {name: "Explorer", url: L1_EXPLORER}},
    testnet: true,
});
