// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title BorrowerRegistry
/// @notice On-chain whitelist of borrowers approved through Aval's KYB process.
///         Off-chain (Supabase + Claude AI) evaluates submissions; on approval,
///         the off-chain issuer key calls `addBorrower` to commit the decision
///         to chain. Public, auditable, censorship-resistant: even if Aval's
///         backend goes dark, already-approved borrowers can keep using the
///         protocol.
/// @dev The owner is the Aval admin key. `score-attest` reads `isApproved` on
///      every attestation request and refuses to sign for non-approved wallets.
contract BorrowerRegistry is Ownable {
    struct BorrowerInfo {
        bool approved;
        uint64 approvedAt;
        /// @notice keccak256 of the off-chain business profile snapshot. Lets
        ///         anyone correlate an on-chain approval with the exact profile
        ///         that was reviewed (stored in Supabase), without leaking PII.
        bytes32 profileHash;
    }

    mapping(address => BorrowerInfo) public borrowers;

    event BorrowerApproved(address indexed borrower, bytes32 profileHash, uint64 timestamp);
    event BorrowerRemoved(address indexed borrower);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Approve a borrower. Idempotent — re-calling refreshes profileHash + timestamp.
    function addBorrower(address borrower, bytes32 profileHash) external onlyOwner {
        require(borrower != address(0), "AVAL/zero-borrower");
        borrowers[borrower] = BorrowerInfo({
            approved: true,
            approvedAt: uint64(block.timestamp),
            profileHash: profileHash
        });
        emit BorrowerApproved(borrower, profileHash, uint64(block.timestamp));
    }

    /// @notice Revoke approval. Loans already opened are unaffected — only new borrows blocked.
    function removeBorrower(address borrower) external onlyOwner {
        require(borrowers[borrower].approved, "AVAL/not-approved");
        delete borrowers[borrower];
        emit BorrowerRemoved(borrower);
    }

    /// @notice Read-only check. Used by score-attest and any client/frontend.
    function isApproved(address borrower) external view returns (bool) {
        return borrowers[borrower].approved;
    }
}
