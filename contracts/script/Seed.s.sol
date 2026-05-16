// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDC} from "../src/MockUSDC.sol";
import {LendingPool} from "../src/LendingPool.sol";

/// @notice Seeds a freshly-deployed Aval testnet:
///         mints USDC to LENDER + BORROWER, deposits LENDER funds into the pool.
///         Only works against MockUSDC (real USDC has no public mint).
///
/// Usage:
///   forge script script/Seed.s.sol \
///     --rpc-url $FUJI_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast -vvv
contract Seed is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address mockUsdc = vm.envAddress("USDC_ADDRESS");
        address pool = vm.envAddress("NEXT_PUBLIC_LENDING_POOL_ADDRESS");
        address lender = vm.envAddress("DEMO_LENDER_ADDRESS");
        address borrower = vm.envOr("DEMO_BORROWER_ADDRESS", address(0));

        uint256 lenderSeedAmount = 50_000e6; // 50k mUSDC
        uint256 borrowerSeedAmount = 1_000e6; // 1k mUSDC (for fee payments)

        vm.startBroadcast(deployerPk);

        // Mint to lender + immediately deposit on their behalf? No — better: mint, then
        // the lender script in the UI does approve+deposit. We just mint here.
        MockUSDC(mockUsdc).mint(lender, lenderSeedAmount);
        console.log("Minted to lender:   ", lenderSeedAmount, "->", lender);

        if (borrower != address(0)) {
            MockUSDC(mockUsdc).mint(borrower, borrowerSeedAmount);
            console.log("Minted to borrower: ", borrowerSeedAmount, "->", borrower);
        }

        // Seed the pool directly from the deployer so the demo has TVL out-of-the-box.
        uint256 deployerSeed = 10_000e6;
        MockUSDC(mockUsdc).mint(msg.sender, deployerSeed);
        IERC20(mockUsdc).approve(pool, deployerSeed);
        LendingPool(pool).deposit(deployerSeed, msg.sender);
        console.log("Seeded pool with:   ", deployerSeed);

        vm.stopBroadcast();
    }
}
