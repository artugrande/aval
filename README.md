<div align="center">

# Aval

**Uncollateralized USDC credit for LatAm SMEs, on Avalanche.**

[Live demo](https://aval-liard.vercel.app) · [Snowtrace](https://testnet.snowtrace.io/address/0x804a67Db321169B8a731fA9C7c28e60B220E3932) · [Hackathon LatAm Institucional 2026](https://build.avax.network/events/8a8ee2e9-d91d-4087-adba-c1221b72e407)

</div>

---

## The problem

> **8 of 10 SMEs in Latin America are excluded from formal credit.** Micro/small/medium enterprises are 90% of LatAm businesses, generate 50% of employment, and contribute 28% of regional GDP — yet they access a fraction of the credit available to bigger firms.

When they do get credit, it's **slow** (weeks of paperwork), **expensive** (30–80% TEA in MX/AR/BR through alternative lenders), and **local** (cheap global liquidity in stablecoins never reaches them).

DeFi today doesn't help either: overcollateralized lending (Aave, Compound) requires putting up *more* USDC than you borrow — useless for working capital.

## The solution

Aval is a credit primitive that connects **global stablecoin liquidity** with **LatAm SMEs**, using on-chain repayment history as the only signal.

- **Lenders** deposit USDC into a single ERC-4626 pool and earn yield from borrower fees.
- **Borrowers** (SMEs) verify their identity in one click and get an initial $100 credit line. **Each loan repaid on time bumps them to the next level**, up to $20,000.
- **No collateral. No banking integration. No revenue data required.** Trust is built loan by loan.

The protocol itself is a thin layer of three contracts plus an off-chain "issuer" that signs EIP-712 attestations encoding the borrower's current credit level.

## How it works (the bootstrap model)

```
L0  blacklisted (after default)
L1  $100      ← starting point after KYB
L2  $250      ← after 1 repaid loan
L3  $500      ← after 2 repaid loans
L4  $1,000
L5  $2,000
L6  $3,500
L7  $5,500
L8  $8,000
L9  $11,000
L10 $14,500
L11 $20,000   ← max
```

Higher level = better repayment track record = **lower fee** (L1 pays 5%, L11 pays 1%).

The economics: at small cap sizes, the cost of acquiring a wallet + KYB + defaulting on $100 is higher than the gain. Sybil-resistance comes from economics, not external data. Borrowers organically grow their cap by being good actors — same mechanism that built trust networks pre-internet.

This avoids the chicken-and-egg of needing bank data, SAT/AFIP integrations, or proprietary scoring to launch. The protocol works from day 1 with zero external data sources.

## Architecture

```
                          ┌──────────────────┐
                          │      Lender      │
                          └────────┬─────────┘
                                   │ USDC deposit
                                   ▼
   ┌──────────────────────────────────────────────────────────┐
   │  LendingPool (ERC-4626)                                   │
   │  • mints avUSDC shares                                    │
   │  • holds USDC, accrues fees from repayments               │
   │  • only CreditManager can pull funds                      │
   └──────────────┬───────────────────────────────────────────┘
                  │ lendTo(borrower, amount)
                  ▼
   ┌──────────────────────────────────────────────────────────┐
   │  CreditManager                                            │
   │  • borrowWithTerm(amount, tenor, fee, attestation, sig)   │
   │  • repay(loanId)                                          │
   │  • markDefault(loanId)                                    │
   │  • verifies EIP-712 signed by whitelisted issuer          │
   └──────────────┬───────────────────────────────────────────┘
                  │ verifies sig against
                  ▼
   ┌──────────────────────────────────────────────────────────┐
   │  IssuerRegistry                                           │
   │  • owner-controlled whitelist of attestation issuers      │
   └──────────────────────────────────────────────────────────┘

   Off-chain (Supabase Edge Functions):
   • kyb-submit     — provisions a profile, returns current level
   • score-attest   — reads on-chain history, signs EIP-712 with
                      current cap. Logs every signature for audit.
```

The issuer key (whitelisted in `IssuerRegistry`) lives in Supabase secrets. The off-chain side **computes the level deterministically from on-chain data** (`nextLoanId`, `loans[i]`, `usedNonces[borrower]`) — no opaque scoring.

## Live deployment

The **public demo** runs on **Avalanche Fuji testnet** (chainId 43113). All contracts are **source-verified** on Snowtrace.

A parallel deployment runs on our own **Aval L1** (Subnet-EVM, chainId 6043, native token `AVL`, PoA validators) — see [`infra/l1`](./infra/l1) for the genesis + reproduction steps. The L1 is the architectural foundation for v2: gas paid in USDC, permissioned validators (banks/regulated entities), throughput dedicated to credit operations.

| Contract        | Address                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| LendingPool     | [`0x1FAf7da7695e138C65F729f73e189065d3FB6bCe`](https://testnet.snowtrace.io/address/0x1FAf7da7695e138C65F729f73e189065d3FB6bCe#code) |
| CreditManager   | [`0x804a67Db321169B8a731fA9C7c28e60B220E3932`](https://testnet.snowtrace.io/address/0x804a67Db321169B8a731fA9C7c28e60B220E3932#code) |
| IssuerRegistry  | [`0xFbA1aA2aB7f0cAf2298Fa34AaAAf31A44723e01b`](https://testnet.snowtrace.io/address/0xFbA1aA2aB7f0cAf2298Fa34AaAAf31A44723e01b#code) |
| MockUSDC        | [`0x6776ADAF66b4ad19fBaC99A4bE0c640421d12fE2`](https://testnet.snowtrace.io/address/0x6776ADAF66b4ad19fBaC99A4bE0c640421d12fE2#code) |

- **Web app**: https://aval-liard.vercel.app
- **Pool TVL (live)**: read from `LendingPool.totalAssets()`
- **Whitelisted issuer signer**: `0x6c00dE6a3752Bb706AED322609584ADaa4BE20BF`

## Try the demo

1. Open https://aval-liard.vercel.app
2. Connect any wallet (MetaMask, Rabby, Coinbase, Rainbow, or WalletConnect QR for mobile)
3. Add Fuji to your wallet if needed:
   - RPC: `https://api.avax-test.network/ext/bc/C/rpc`
   - ChainID: `43113`
   - Currency: AVAX
4. Get a bit of testnet AVAX at the [Core faucet](https://core.app/tools/testnet-faucet)
5. **`/lend`** → click "Mintear 10k mUSDC" → approve → deposit some
6. **`/borrow`** → wait ~1s for "leyendo on-chain" → you'll see L1 / $100 cap
7. Pick an amount (e.g. $50), 30-day term → "Pedir préstamo" → sign in wallet
8. Your loan appears below as "Activo". Click "Aprobar mUSDC" → "Repagar"
9. Refresh and watch your cap level go up to L2 ($250)

## Tech stack

| Layer        | Choice                                                                |
| ------------ | --------------------------------------------------------------------- |
| Chain        | Avalanche Fuji testnet (C-Chain), chainId 43113                       |
| Contracts    | Foundry + OpenZeppelin (Solidity 0.8.27, Cancun)                      |
| Frontend     | Next.js 16 + React 19 + Tailwind 4 + wagmi v2 + RainbowKit            |
| Hosting      | Vercel                                                                |
| Backend      | Supabase (Postgres + Edge Functions, Deno runtime, viem for EIP-712) |
| Wallet       | RainbowKit (MetaMask, Rabby, WalletConnect, Coinbase, Rainbow)        |
| Verification | Routescan (Snowtrace) — source-verified, no API key required          |

## Project structure

```
aval/
├── infra/l1/          Aval L1 (Subnet-EVM) reproducible genesis + setup
├── contracts/         Foundry workspace
│   ├── src/
│   │   ├── LendingPool.sol     ERC-4626 USDC vault
│   │   ├── CreditManager.sol   EIP-712 attestation verifier + loan logic
│   │   ├── IssuerRegistry.sol  Whitelist (Ownable)
│   │   └── MockUSDC.sol        6-decimal USDC with faucet (testnet only)
│   ├── test/Aval.t.sol         End-to-end tests (deposit, attest, borrow, repay, default)
│   ├── script/
│   │   ├── Deploy.s.sol        Deploys all contracts + wires them up
│   │   └── Seed.s.sol          Mints USDC + seeds pool TVL
│   └── foundry.toml
├── supabase/
│   ├── migrations/             Schema: profiles, snapshots, kyb_docs, attestation_log
│   └── functions/
│       ├── kyb-submit/         POST: provision profile, return level
│       ├── score-attest/       POST: read on-chain → sign EIP-712 attestation
│       └── _shared/            CORS + EIP-712 type defs
├── web/                        Next.js app
│   ├── src/app/                Routes: /, /lend, /borrow, /stats
│   ├── src/lib/                wagmi, contracts, ABIs, api wrappers
│   ├── src/hooks/              useBorrowerLoans (multicall reader)
│   └── src/components/         Header with nav + ConnectButton
├── package.json                pnpm workspace root
└── README.md
```

## Local development

Requirements: Foundry, Node 20+, pnpm 10+, Supabase CLI (optional).

```bash
# Install JS deps
pnpm install

# Contracts
cd contracts
forge build
forge test -vv

# Run web app locally (uses the live Supabase + deployed Fuji contracts)
cp web/.env.example web/.env.local   # add your own contract addresses if redeploying
pnpm web:dev                         # http://localhost:3000
```

To deploy your own copy:

```bash
# 1. Deploy contracts
cd contracts
cp .env.example .env
# Fill in DEPLOYER_PRIVATE_KEY (with Fuji AVAX) + INITIAL_ISSUER_ADDRESS
source .env
forge script script/Deploy.s.sol \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --broadcast -vvv
# Copy the 4 printed addresses into web/.env.local

# 2. Supabase project (create at supabase.com)
cd supabase
supabase link --project-ref <your-ref>
supabase db push
supabase functions deploy kyb-submit score-attest
supabase secrets set ISSUER_PRIVATE_KEY=0x... CREDIT_MANAGER_ADDRESS=0x...

# 3. Web
cd web
pnpm dev   # or `vercel deploy --prod` for production
```

## Market context

| Metric                                              | Value     |
| --------------------------------------------------- | --------- |
| Global MSME finance gap (formal)                    | **$5.2T** |
| Global MSME finance gap (formal + informal)         | **$8.1T** |
| LatAm MSMEs as % of total enterprises               | 90%       |
| LatAm MSMEs as % of formal employment               | 50%       |
| LatAm MSMEs as % of regional GDP                    | 28%       |
| Credit-to-GDP ratio · Mexico                        | ~21%      |
| Credit-to-GDP ratio · Argentina                     | ~15%      |
| Credit-to-GDP ratio · Chile (best in region)        | ~60%      |

Sources: [IFC MSME Finance Gap](https://www.smefinanceforum.org/data-sites/msme-finance-gap), [IDB](https://www.iadb.org/en/news/small-businesses-turn-fintechs-bridge-funding-gap-latin-america), [CEPAL](https://www.cepal.org/es/publicaciones/35358-eliminando-barreras-financiamiento-pymes-america-latina).

## Roadmap

| Phase | What                                                                     | Time after seed |
| ----- | ------------------------------------------------------------------------ | --------------- |
| v1 ✅  | Bootstrap by repayment, single-issuer, MockUSDC on Fuji                  | done            |
| v2    | Real USDC on Avalanche C-Chain mainnet · SIWE auth · WalletConnect QR     | 2–4 weeks       |
| v3    | Multi-issuer registry (Konfio, Creditas, Belvo as competing scorers)     | 1–3 months      |
| v4    | Avalanche L1 (Subnet-EVM) with USDC as gas + permissioned validators     | 3–6 months      |
| v5    | zkTLS attestations (Reclaim) for fast-track caps using bank/fiscal data  | 6+ months       |
| v6    | Issuer reputation + slashing for bad scores                              | 6+ months       |

## Design decisions

A few things we chose to **not** do, with the reasoning:

- **No oracle-driven scoring in v1.** The bootstrap model gets us to live demo with zero external dependencies. Real scoring sources (Belvo, SAT, AFIP, NFe, Open Finance) become *issuers* in v3, not core protocol.
- **No on-chain identity proof in v1.** The wallet is the identity. Adding identity proofs (e.g. soulbound or zkPassport) is a future issuer's job, not the protocol.
- **Borrower picks tenor, protocol picks fee.** Fee is a function of level, not market-determined. Avoids a fragile fee-auction in v1.
- **Single ERC-4626 pool, no tranches.** Junior tranche absorbing first-loss is in the roadmap; v1 has lenders absorb all defaults pro-rata.
- **Multicall on `loans(i)` instead of an indexer.** Trivial scale today; subgraph or Supabase trigger when N > a few hundred.

## License

MIT. See [LICENSE](LICENSE).

---

<div align="center">

Built for **Hackathon LatAm Institucional** · May 2026 · Avalanche

</div>
