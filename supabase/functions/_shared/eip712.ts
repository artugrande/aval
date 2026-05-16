// EIP-712 typed-data spec for Aval credit attestations.
// Must match `CreditManager.sol`:
//   EIP712("Aval", "1")
//   ATTESTATION_TYPEHASH = keccak256(
//     "CreditAttestation(address borrower,uint256 maxCap,uint64 expiresAt,uint256 nonce,bytes32 scoreId)"
//   )

import type {Address, Hex, TypedDataDomain} from "npm:viem@^2.21.0";

export const AVAL_TYPED_DATA_TYPES = {
    CreditAttestation: [
        {name: "borrower", type: "address"},
        {name: "maxCap", type: "uint256"},
        {name: "expiresAt", type: "uint64"},
        {name: "nonce", type: "uint256"},
        {name: "scoreId", type: "bytes32"},
    ],
} as const;

export interface CreditAttestation {
    borrower: Address;
    maxCap: bigint;
    expiresAt: bigint;
    nonce: bigint;
    scoreId: Hex;
}

export function avalDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
    return {
        name: "Aval",
        version: "1",
        chainId,
        verifyingContract,
    };
}
