// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title IssuerRegistry
/// @notice Whitelist of addresses authorized to sign EIP-712 credit attestations.
/// @dev Owner is the protocol multisig in production; a single key in hackathon demo.
contract IssuerRegistry is Ownable {
    mapping(address => bool) public isIssuer;

    event IssuerAdded(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function addIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "AVAL/zero-issuer");
        require(!isIssuer[issuer], "AVAL/already-issuer");
        isIssuer[issuer] = true;
        emit IssuerAdded(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        require(isIssuer[issuer], "AVAL/not-issuer");
        isIssuer[issuer] = false;
        emit IssuerRemoved(issuer);
    }
}
