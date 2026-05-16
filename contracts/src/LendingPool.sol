// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC4626, IERC20, IERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LendingPool
/// @notice ERC-4626 vault holding USDC. Lenders deposit, earn yield from loan fees.
///         Only the CreditManager can withdraw principal to fund a loan.
contract LendingPool is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    address public creditManager;

    event CreditManagerSet(address indexed manager);
    event LoanFunded(address indexed to, uint256 amount);

    constructor(IERC20 asset_, address initialOwner)
        ERC4626(asset_)
        ERC20("Aval USDC Vault", "avUSDC")
        Ownable(initialOwner)
    {}

    function setCreditManager(address manager) external onlyOwner {
        require(manager != address(0), "AVAL/zero-manager");
        creditManager = manager;
        emit CreditManagerSet(manager);
    }

    /// @notice Pull assets out of the pool to fund a loan. CreditManager-only.
    /// @dev Pool accounting (totalAssets) drops by `amount` until the borrower repays
    ///      principal + fee back into this contract.
    function lendTo(address to, uint256 amount) external {
        require(msg.sender == creditManager, "AVAL/not-manager");
        IERC20(asset()).safeTransfer(to, amount);
        emit LoanFunded(to, amount);
    }
}
