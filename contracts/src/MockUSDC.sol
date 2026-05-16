// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice 6-decimal USDC stand-in for Fuji testnet demos. NOT for mainnet.
/// @dev `faucet()` lets anyone mint up to 10k mUSDC to themselves for testing.
contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_CAP = 10_000e6; // 10k mUSDC

    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Anyone can mint to anyone. Demo-only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Self-serve faucet capped per call.
    function faucet(uint256 amount) external {
        require(amount <= FAUCET_CAP, "MockUSDC/faucet-cap");
        _mint(msg.sender, amount);
    }
}
