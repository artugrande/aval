import type {Address} from "viem";
import {avalancheFuji} from "wagmi/chains";

import {avalL1} from "./wagmi-chains";

// Deployed addresses come from `forge script ... --broadcast` on each chain.
// Zero address = "not deployed on this chain yet"; components render an empty state.
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// IMPORTANT: each `process.env.NEXT_PUBLIC_X` must be a STATIC literal reference.
// Next.js (Turbopack/Webpack) only inlines NEXT_PUBLIC_* env vars at build time
// when accessed via direct property syntax. Dynamic access (`process.env[key]`)
// returns undefined in the browser bundle and silently fails.
const fallback = (v: string | undefined): Address => (v as Address | undefined) ?? ZERO;

export interface ChainContracts {
    issuerRegistry: Address;
    lendingPool: Address;
    creditManager: Address;
    usdc: Address;
}

// Registry of Aval deployments per chain. Add a new entry when the protocol
// goes live on a new chain. Components read the active chain via `useChainId()`
// and `getContracts(chainId)`.
const REGISTRY: Record<number, ChainContracts> = {
    [avalancheFuji.id]: {
        issuerRegistry: fallback(process.env.NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS),
        lendingPool: fallback(process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS),
        creditManager: fallback(process.env.NEXT_PUBLIC_CREDIT_MANAGER_ADDRESS),
        usdc: fallback(process.env.NEXT_PUBLIC_USDC_ADDRESS),
    },
    [avalL1.id]: {
        issuerRegistry: fallback(process.env.NEXT_PUBLIC_L1_ISSUER_REGISTRY_ADDRESS),
        lendingPool: fallback(process.env.NEXT_PUBLIC_L1_LENDING_POOL_ADDRESS),
        creditManager: fallback(process.env.NEXT_PUBLIC_L1_CREDIT_MANAGER_ADDRESS),
        usdc: fallback(process.env.NEXT_PUBLIC_L1_USDC_ADDRESS),
    },
};

const FALLBACK: ChainContracts = {
    issuerRegistry: ZERO,
    lendingPool: ZERO,
    creditManager: ZERO,
    usdc: ZERO,
};

/** Returns the contract addresses for the given chain. */
export function getContracts(chainId: number | undefined): ChainContracts {
    if (chainId == null) return FALLBACK;
    return REGISTRY[chainId] ?? FALLBACK;
}

/** Backwards-compat shim. New code should call `getContracts(useChainId())`. */
export const contracts: ChainContracts = REGISTRY[avalancheFuji.id] ?? FALLBACK;

export const isDeployed = (addr: Address) => addr !== ZERO;

// Minimal ABIs — only the functions/events the UI calls. Full ABIs after
// `forge build` come out of `contracts/out/<Name>.sol/<Name>.json` and can be
// generated with wagmi-cli or copy-pasted into a `generated.ts`.

export const lendingPoolAbi = [
    {
        type: "function",
        name: "deposit",
        stateMutability: "nonpayable",
        inputs: [
            {name: "assets", type: "uint256"},
            {name: "receiver", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "withdraw",
        stateMutability: "nonpayable",
        inputs: [
            {name: "assets", type: "uint256"},
            {name: "receiver", type: "address"},
            {name: "owner", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "totalAssets",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{name: "account", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "convertToAssets",
        stateMutability: "view",
        inputs: [{name: "shares", type: "uint256"}],
        outputs: [{name: "", type: "uint256"}],
    },
] as const;

export const creditManagerAbi = [
    {
        type: "function",
        name: "borrowWithTerm",
        stateMutability: "nonpayable",
        inputs: [
            {name: "amount", type: "uint256"},
            {name: "tenorDays", type: "uint16"},
            {name: "feeBps", type: "uint16"},
            {
                name: "att",
                type: "tuple",
                components: [
                    {name: "borrower", type: "address"},
                    {name: "maxCap", type: "uint256"},
                    {name: "expiresAt", type: "uint64"},
                    {name: "nonce", type: "uint256"},
                    {name: "scoreId", type: "bytes32"},
                ],
            },
            {name: "signature", type: "bytes"},
        ],
        outputs: [{name: "loanId", type: "uint256"}],
    },
    {
        type: "function",
        name: "repay",
        stateMutability: "nonpayable",
        inputs: [{name: "loanId", type: "uint256"}],
        outputs: [],
    },
    {
        type: "function",
        name: "outstanding",
        stateMutability: "view",
        inputs: [{name: "borrower", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "loans",
        stateMutability: "view",
        inputs: [{name: "loanId", type: "uint256"}],
        outputs: [
            {name: "borrower", type: "address"},
            {name: "principal", type: "uint256"},
            {name: "feeBps", type: "uint16"},
            {name: "startedAt", type: "uint64"},
            {name: "maturityAt", type: "uint64"},
            {name: "repaid", type: "bool"},
            {name: "defaulted", type: "bool"},
        ],
    },
    {
        type: "function",
        name: "nextLoanId",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
    },
] as const;

export type LoanStatus = "active" | "overdue" | "repaid" | "defaulted";

export interface Loan {
    loanId: bigint;
    borrower: `0x${string}`;
    principal: bigint;
    feeBps: number;
    startedAt: bigint;
    maturityAt: bigint;
    repaid: boolean;
    defaulted: boolean;
}

export function loanStatus(loan: Loan, now: number = Math.floor(Date.now() / 1000)): LoanStatus {
    if (loan.repaid) return "repaid";
    if (loan.defaulted) return "defaulted";
    if (BigInt(now) > loan.maturityAt) return "overdue";
    return "active";
}

export function loanTotalDue(loan: Loan): bigint {
    return loan.principal + (loan.principal * BigInt(loan.feeBps)) / 10_000n;
}

export const erc20Abi = [
    {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
            {name: "spender", type: "address"},
            {name: "amount", type: "uint256"},
        ],
        outputs: [{name: "", type: "bool"}],
    },
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{name: "account", type: "address"}],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
            {name: "owner", type: "address"},
            {name: "spender", type: "address"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        name: "decimals",
        stateMutability: "view",
        inputs: [],
        outputs: [{name: "", type: "uint8"}],
    },
] as const;

// MockUSDC adds a public `faucet(uint256)` capped at 10k per call (FAUCET_CAP).
// Real USDC won't have this — only used on Fuji testnet demo.
export const mockUsdcAbi = [
    ...erc20Abi,
    {
        type: "function",
        name: "faucet",
        stateMutability: "nonpayable",
        inputs: [{name: "amount", type: "uint256"}],
        outputs: [],
    },
] as const;

export const FAUCET_MAX_MICRO = 10_000_000_000n; // 10,000 mUSDC

// Protocol-determined fee schedule by credit level. Higher level = better repayment
// history = lower fee. Borrower doesn't choose this — the UI enforces the level's fee.
// (The on-chain contract still accepts an arbitrary feeBps; in v2 we'd bake the fee
// into the EIP-712 attestation so the issuer enforces it cryptographically.)
//                                  L0  L1   L2   L3   L4   L5   L6   L7   L8   L9   L10  L11
export const FEE_BPS_BY_LEVEL = [    0, 500, 425, 350, 300, 250, 225, 200, 175, 150, 125, 100] as const;

export function feeBpsForLevel(level: number): number {
    if (level < 1 || level > 11) return 500;
    return FEE_BPS_BY_LEVEL[level];
}

export function formatPercentage(bps: number): string {
    return `${(bps / 100).toFixed(2)}%`;
}
