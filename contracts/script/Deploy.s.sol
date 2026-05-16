// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDC} from "../src/MockUSDC.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {LendingPool} from "../src/LendingPool.sol";
import {CreditManager} from "../src/CreditManager.sol";

/// @notice Deploys Aval to an EVM chain.
///         If USDC_ADDRESS env is unset (or 0x0), deploys a MockUSDC.
///         If INITIAL_ISSUER_ADDRESS is set, adds it to the IssuerRegistry.
///
/// Usage (Fuji):
///   forge script script/Deploy.s.sol \
///     --rpc-url $FUJI_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY \
///     --broadcast --verify -vvv
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // Resolve the underlying asset.
        address asset = vm.envOr("USDC_ADDRESS", address(0));
        bool deployMock = asset == address(0);

        vm.startBroadcast(pk);

        if (deployMock) {
            MockUSDC mock = new MockUSDC();
            asset = address(mock);
            console.log("Deployed MockUSDC at:", asset);
        } else {
            console.log("Using existing USDC at:", asset);
        }

        IssuerRegistry registry = new IssuerRegistry(deployer);
        LendingPool pool = new LendingPool(IERC20(asset), deployer);
        CreditManager manager = new CreditManager(pool, registry);

        pool.setCreditManager(address(manager));

        address initialIssuer = vm.envOr("INITIAL_ISSUER_ADDRESS", address(0));
        if (initialIssuer != address(0)) {
            registry.addIssuer(initialIssuer);
            console.log("Whitelisted initial issuer:", initialIssuer);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("===== Aval deployed =====");
        console.log("Chain id:        ", block.chainid);
        console.log("Deployer:        ", deployer);
        console.log("USDC:            ", asset);
        console.log("IssuerRegistry:  ", address(registry));
        console.log("LendingPool:     ", address(pool));
        console.log("CreditManager:   ", address(manager));
        console.log("");
        console.log("Copy these into web/.env.local:");
        console.log("NEXT_PUBLIC_USDC_ADDRESS=", asset);
        console.log("NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS=", address(registry));
        console.log("NEXT_PUBLIC_LENDING_POOL_ADDRESS=", address(pool));
        console.log("NEXT_PUBLIC_CREDIT_MANAGER_ADDRESS=", address(manager));
    }
}
