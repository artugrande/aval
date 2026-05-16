# Aval L1 (Subnet-EVM)

Reproducible configuration for the **Aval L1** — our sovereign Avalanche L1 with native gas token `AVL`, chainId `6043`, Proof-of-Authority consensus, ICM/Warp enabled.

The v1 demo runs on Avalanche Fuji C-Chain (publicly accessible). This L1 is the **architectural proof** that the same contracts run on a chain we control end-to-end, with the production benefits we'd unlock in v2:

- Gas token customizable (today native `AVL`, v2 = USDC bridged via ICM)
- Permissioned validator set (today single PoA owner, v2 = consortium of regulated entities like banks)
- Throughput dedicated to credit operations, no contention from unrelated traffic
- Reward Manager precompile gives us control over where fees go (treasury, burn, rebate)

## Specs

| | |
|---|---|
| Chain name | aval |
| ChainID | `6043` |
| Token | `AVL` (18 decimals) |
| Consensus | Proof-of-Authority |
| Validator Manager owner | `0x9c3Cf7A804C7c17B945250AAA6a0530690EAff54` |
| Proxy Admin | `0x9c3Cf7A804C7c17B945250AAA6a0530690EAff54` |
| Block time | ~2s |
| Gas limit | 8M |
| ICM/Warp | enabled at genesis |
| VM | Subnet-EVM v0.8.0 |

## Genesis allocations

| Address | Role | Balance |
|---|---|---|
| `0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC` | ewoq (well-known test key) | 1,000,000 AVL |
| `0x9c3Cf7A804C7c17B945250AAA6a0530690EAff54` | Aval deployer | 1,000 AVL |
| `0x6c00dE6a3752Bb706AED322609584ADaa4BE20BF` | Aval issuer signer | 10 AVL |
| `0x509e14aa66D0636A96Ac46BE0B5477633b4718C1` | cli-teleporter-deployer | 600 AVL |

## Aval contracts deployed on the L1

After running `forge script script/Deploy.s.sol` against the local L1 RPC:

| Contract | Address |
|---|---|
| MockUSDC | `0x5fa173D3Ce77b84bCd4B6b88B2196a38E6a59195` |
| IssuerRegistry | `0x1E8f9f16eB19c980375B39D70fc198F507618A60` |
| LendingPool | `0x5e27e1fFC65BFEDdAe79B3CA89Fa09E617F2F853` |
| CreditManager | `0x5dAD0f11e8CFf1069c0343F86A41EDeb3AF511b0` |

(Addresses are deterministic from deployer nonce — if you redeploy from the same wallet, you get the same addresses.)

## How to reproduce locally

Requires [avalanche-cli](https://github.com/ava-labs/avalanche-cli) and Foundry.

```bash
# 1. Create the L1 blockchain config
avalanche blockchain create aval \
  --evm \
  --evm-chain-id 6043 \
  --evm-token AVL \
  --proof-of-authority \
  --validator-manager-owner 0x9c3Cf7A804C7c17B945250AAA6a0530690EAff54 \
  --proxy-contract-owner 0x9c3Cf7A804C7c17B945250AAA6a0530690EAff54 \
  --test-defaults --icm --warp --force

# 2. Replace generated genesis with the one committed in this repo
# (to preserve our deployer/issuer allocations)
cp infra/l1/genesis.json ~/.avalanche-cli/subnets/aval/genesis.json

# 3. Deploy the L1 locally (avalanche-cli spins up an avalanchego node)
avalanche blockchain deploy aval --local --ewoq --num-bootstrap-validators 1

# 4. Capture the RPC URL from the output (something like):
#    http://127.0.0.1:9654/ext/bc/<BLOCKCHAIN_ID>/rpc
export AVAL_L1_RPC=http://127.0.0.1:9654/ext/bc/<BLOCKCHAIN_ID>/rpc

# 5. Deploy Aval contracts on the L1
cd contracts
DEPLOYER_PRIVATE_KEY=<your-pk> \
INITIAL_ISSUER_ADDRESS=0x6c00dE6a3752Bb706AED322609584ADaa4BE20BF \
forge script script/Deploy.s.sol \
  --rpc-url $AVAL_L1_RPC \
  --broadcast --slow --skip-simulation

# 6. (Optional) Seed the pool with mUSDC
# See contracts/script/Seed.s.sol or run the cast commands in the project README
```

## Roadmap for the L1

| Phase | What |
|---|---|
| ✅ Demo (now) | Local single-node L1, deployer + issuer pre-funded, contracts deployed |
| v2 | Deploy to Fuji testnet with persistent validators (DigitalOcean or similar) |
| v3 | ICM bridge between Avalanche C-Chain mainnet and Aval L1 (USDC bridged in/out) |
| v4 | USDC as gas token on the L1 (via Native Token Home/Remote contracts + Native Minter precompile) |
| v5 | Multi-validator consortium (Bankaool + regulated partners) — moves from PoA to permissioned PoS |
| v6 | Public block explorer (Routescan or self-hosted Blockscout) |

## Why this matters for the pitch

A PyME owner in Guadalajara should never need to think about gas. With the L1:

- They pay fees in the same asset they borrow (USDC), not in AVAX
- The chain doesn't get congested by NFT mints or unrelated traffic
- Compliance posture is provable: validators are regulated entities, every block is signed by an entity we (and regulators) know
- The cost of writing scoring attestations or KYB updates is predictable (we set the gas price)

This L1 is the architectural foundation for that future. v1 ships on Fuji C-Chain to onboard early users with zero infra setup; v2 migrates them to the L1.
