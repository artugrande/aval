// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";

import {BorrowerRegistry} from "../src/BorrowerRegistry.sol";

/// @notice Deploys the BorrowerRegistry standalone (no CreditManager changes needed).
///         Owner is the issuer wallet — same address that signs EIP-712
///         attestations off-chain. That key approves borrowers on-chain too,
///         giving us a single source of truth for who's allowed to borrow.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... \
///   REGISTRY_OWNER=0x6c00dE6a3752Bb706AED322609584ADaa4BE20BF \
///   forge script script/DeployRegistry.s.sol \
///     --rpc-url $RPC --broadcast -vvv
contract DeployRegistry is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("REGISTRY_OWNER");

        vm.startBroadcast(pk);
        BorrowerRegistry registry = new BorrowerRegistry(owner);
        vm.stopBroadcast();

        console.log("");
        console.log("===== BorrowerRegistry deployed =====");
        console.log("Chain id:           ", block.chainid);
        console.log("Owner:              ", owner);
        console.log("BorrowerRegistry:   ", address(registry));
        console.log("");
        console.log("Add to web/.env.local:");
        console.log("NEXT_PUBLIC_BORROWER_REGISTRY_ADDRESS=", address(registry));
    }
}
