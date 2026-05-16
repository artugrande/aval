// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";

import {LendingPool} from "../src/LendingPool.sol";
import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {CreditManager} from "../src/CreditManager.sol";

/// @notice In-place upgrade of CreditManager only. Keeps the existing pool,
///         registry and USDC mock untouched (preserves seeded TVL + whitelisted
///         issuers + bridged USDC). Wires the new manager into the existing pool.
///
/// Required env:
///   DEPLOYER_PRIVATE_KEY   — must be the pool's current owner
///   POOL_ADDRESS           — existing LendingPool
///   ISSUER_REGISTRY_ADDRESS — existing IssuerRegistry
/// Optional:
///   PROTOCOL_TREASURY      — defaults to deployer
///
/// Usage:
///   forge script script/ManagerUpgrade.s.sol --rpc-url $RPC --broadcast -vvv
contract ManagerUpgrade is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address poolAddr = vm.envAddress("POOL_ADDRESS");
        address registryAddr = vm.envAddress("ISSUER_REGISTRY_ADDRESS");
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);

        LendingPool pool = LendingPool(poolAddr);
        IssuerRegistry registry = IssuerRegistry(registryAddr);

        vm.startBroadcast(pk);

        CreditManager manager = new CreditManager(pool, registry, treasury, deployer);
        pool.setCreditManager(address(manager));

        vm.stopBroadcast();

        console.log("");
        console.log("===== CreditManager upgraded =====");
        console.log("Chain id:           ", block.chainid);
        console.log("Pool (unchanged):   ", poolAddr);
        console.log("Registry (unchanged):", registryAddr);
        console.log("Treasury:           ", treasury);
        console.log("New CreditManager:  ", address(manager));
        console.log("Protocol fee:       ", manager.protocolFeeBps());
        console.log("");
        console.log("Update env var:");
        console.log("NEXT_PUBLIC_CREDIT_MANAGER_ADDRESS=", address(manager));
    }
}
