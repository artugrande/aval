// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IssuerRegistry} from "../src/IssuerRegistry.sol";
import {LendingPool} from "../src/LendingPool.sol";
import {CreditManager} from "../src/CreditManager.sol";

/// @dev USDC-like mock (6 decimals).
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract AvalEndToEndTest is Test {
    // actors
    address owner = makeAddr("owner");
    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");

    uint256 issuerPk = 0xA11CE;
    address issuer; // derived from issuerPk

    // protocol
    MockUSDC usdc;
    IssuerRegistry registry;
    LendingPool pool;
    CreditManager manager;

    // EIP-712
    bytes32 constant ATTESTATION_TYPEHASH = keccak256(
        "CreditAttestation(address borrower,uint256 maxCap,uint64 expiresAt,uint256 nonce,bytes32 scoreId)"
    );

    function setUp() public {
        issuer = vm.addr(issuerPk);

        vm.startPrank(owner);
        usdc = new MockUSDC();
        registry = new IssuerRegistry(owner);
        pool = new LendingPool(IERC20(address(usdc)), owner);
        manager = new CreditManager(pool, registry);
        pool.setCreditManager(address(manager));
        registry.addIssuer(issuer);
        vm.stopPrank();

        // Seed lender with USDC and have them deposit into the pool
        usdc.mint(lender, 10_000e6);
        vm.startPrank(lender);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(10_000e6, lender);
        vm.stopPrank();
    }

    function test_borrow_and_repay_growsPoolAssets() public {
        // Issuer attests: borrower can owe up to 1,000 USDC, expires in 1h, nonce=0
        CreditManager.CreditAttestation memory att = CreditManager.CreditAttestation({
            borrower: borrower,
            maxCap: 1_000e6,
            expiresAt: uint64(block.timestamp + 1 hours),
            nonce: 0,
            scoreId: bytes32(uint256(1))
        });
        bytes memory sig = _signAttestation(att);

        // Borrow 500 USDC for 30 days at 200 bps (2%) fee
        vm.prank(borrower);
        uint256 loanId = manager.borrowWithTerm(500e6, 30, 200, att, sig);

        assertEq(usdc.balanceOf(borrower), 500e6, "borrower received principal");
        assertEq(manager.outstanding(borrower), 500e6, "outstanding tracked");
        assertEq(pool.totalAssets(), 9_500e6, "pool assets dropped by principal");

        // Borrower repays principal + 2% fee = 510 USDC. Mint the fee from thin air for the test.
        usdc.mint(borrower, 10e6);
        vm.startPrank(borrower);
        usdc.approve(address(manager), type(uint256).max);
        manager.repay(loanId);
        vm.stopPrank();

        assertEq(pool.totalAssets(), 10_010e6, "pool assets grew by the fee");
        assertEq(manager.outstanding(borrower), 0, "outstanding cleared");
    }

    function test_borrow_revertsOnBadSigner() public {
        CreditManager.CreditAttestation memory att = CreditManager.CreditAttestation({
            borrower: borrower,
            maxCap: 1_000e6,
            expiresAt: uint64(block.timestamp + 1 hours),
            nonce: 0,
            scoreId: bytes32(0)
        });
        // Sign with a random key that's NOT a whitelisted issuer
        (, uint256 randomPk) = makeAddrAndKey("random");
        bytes32 digest = manager.domainSeparator();
        bytes32 structHash = keccak256(
            abi.encode(ATTESTATION_TYPEHASH, att.borrower, att.maxCap, att.expiresAt, att.nonce, att.scoreId)
        );
        bytes32 finalHash = keccak256(abi.encodePacked("\x19\x01", digest, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(randomPk, finalHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(borrower);
        vm.expectRevert(bytes("AVAL/bad-signer"));
        manager.borrowWithTerm(500e6, 30, 200, att, sig);
    }

    function test_borrow_revertsWhenExceedsCap() public {
        CreditManager.CreditAttestation memory att = CreditManager.CreditAttestation({
            borrower: borrower,
            maxCap: 1_000e6,
            expiresAt: uint64(block.timestamp + 1 hours),
            nonce: 0,
            scoreId: bytes32(0)
        });
        bytes memory sig = _signAttestation(att);

        vm.prank(borrower);
        vm.expectRevert(bytes("AVAL/exceeds-cap"));
        manager.borrowWithTerm(1_500e6, 30, 200, att, sig);
    }

    function test_default_marksLoanAndAccountsLoss() public {
        CreditManager.CreditAttestation memory att = CreditManager.CreditAttestation({
            borrower: borrower,
            maxCap: 1_000e6,
            expiresAt: uint64(block.timestamp + 1 hours),
            nonce: 0,
            scoreId: bytes32(0)
        });
        bytes memory sig = _signAttestation(att);

        vm.prank(borrower);
        uint256 loanId = manager.borrowWithTerm(500e6, 30, 200, att, sig);

        // Jump past maturity
        vm.warp(block.timestamp + 31 days);
        manager.markDefault(loanId);

        (,,,,, bool repaid, bool defaulted) = manager.loans(loanId);
        assertFalse(repaid);
        assertTrue(defaulted);
        assertEq(manager.outstanding(borrower), 0);
        // Pool still down by 500 USDC — loss is realized.
        assertEq(pool.totalAssets(), 9_500e6);
    }

    // ---------- helpers ----------

    function _signAttestation(CreditManager.CreditAttestation memory att) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(ATTESTATION_TYPEHASH, att.borrower, att.maxCap, att.expiresAt, att.nonce, att.scoreId)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", manager.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerPk, digest);
        return abi.encodePacked(r, s, v);
    }
}
