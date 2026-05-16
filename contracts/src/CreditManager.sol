// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {LendingPool} from "./LendingPool.sol";
import {IssuerRegistry} from "./IssuerRegistry.sol";

/// @title CreditManager
/// @notice Verifies an EIP-712 credit attestation signed by a whitelisted issuer,
///         opens a fixed-term uncollateralized loan, and handles repayment / default.
/// @dev On repay, the loan fee is split between the lending pool (lenders' yield)
///      and a protocol treasury. Default split is 85% lenders / 15% protocol —
///      adjustable by the owner up to MAX_PROTOCOL_FEE_BPS (30%).
contract CreditManager is EIP712, Ownable {
    using SafeERC20 for IERC20;

    // ---------- Types ----------

    struct CreditAttestation {
        address borrower; // who can draw
        uint256 maxCap; // max outstanding principal allowed (asset decimals)
        uint64 expiresAt; // attestation expiration (unix seconds)
        uint256 nonce; // borrower nonce — must be >= usedNonces[borrower]
        bytes32 scoreId; // ref to off-chain score snapshot (for audit trail)
    }

    struct Loan {
        address borrower;
        uint256 principal;
        uint16 feeBps; // fixed fee charged on principal, paid at repay
        uint64 startedAt;
        uint64 maturityAt;
        bool repaid;
        bool defaulted;
    }

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "CreditAttestation(address borrower,uint256 maxCap,uint64 expiresAt,uint256 nonce,bytes32 scoreId)"
    );

    uint16 public constant MAX_FEE_BPS = 5_000; // 50% absolute cap (borrower loan fee)
    uint16 public constant MAX_TENOR_DAYS = 365;
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 3_000; // 30% absolute ceiling on protocol cut
    uint16 public constant DEFAULT_PROTOCOL_FEE_BPS = 1_500; // 15% — the v1 sustainability number

    // ---------- State ----------

    LendingPool public immutable pool;
    IssuerRegistry public immutable registry;
    IERC20 public immutable asset;

    /// @notice Protocol cut on loan fees, in basis points (out of 10_000).
    uint16 public protocolFeeBps;
    /// @notice Address that receives the protocol's share of every repayment.
    address public protocolTreasury;

    uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256) public usedNonces; // next acceptable nonce
    mapping(address => uint256) public outstanding; // total outstanding principal per borrower

    // ---------- Events ----------

    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint16 tenorDays,
        uint16 feeBps,
        bytes32 scoreId
    );
    event LoanRepaid(uint256 indexed loanId, uint256 totalPaid, uint256 protocolCut, uint256 lenderCut);
    event LoanDefaulted(uint256 indexed loanId);
    event ProtocolFeeBpsUpdated(uint16 oldBps, uint16 newBps);
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ---------- Init ----------

    constructor(
        LendingPool pool_,
        IssuerRegistry registry_,
        address protocolTreasury_,
        address initialOwner_
    ) EIP712("Aval", "1") Ownable(initialOwner_) {
        require(protocolTreasury_ != address(0), "AVAL/zero-treasury");
        pool = pool_;
        registry = registry_;
        asset = IERC20(IERC4626(address(pool_)).asset());
        protocolTreasury = protocolTreasury_;
        protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS;
        emit ProtocolTreasuryUpdated(address(0), protocolTreasury_);
        emit ProtocolFeeBpsUpdated(0, DEFAULT_PROTOCOL_FEE_BPS);
    }

    // ---------- Core: borrow / repay / default ----------

    function borrowWithTerm(
        uint256 amount,
        uint16 tenorDays,
        uint16 feeBps,
        CreditAttestation calldata att,
        bytes calldata signature
    ) external returns (uint256 loanId) {
        require(amount > 0, "AVAL/zero-amount");
        require(tenorDays > 0 && tenorDays <= MAX_TENOR_DAYS, "AVAL/bad-tenor");
        require(feeBps <= MAX_FEE_BPS, "AVAL/fee-too-high");
        require(att.borrower == msg.sender, "AVAL/not-borrower");
        require(att.expiresAt >= block.timestamp, "AVAL/att-expired");
        require(att.nonce >= usedNonces[msg.sender], "AVAL/stale-nonce");
        require(outstanding[msg.sender] + amount <= att.maxCap, "AVAL/exceeds-cap");

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(ATTESTATION_TYPEHASH, att.borrower, att.maxCap, att.expiresAt, att.nonce, att.scoreId))
        );
        address signer = ECDSA.recover(digest, signature);
        require(registry.isIssuer(signer), "AVAL/bad-signer");

        usedNonces[msg.sender] = att.nonce + 1;
        outstanding[msg.sender] += amount;

        loanId = ++nextLoanId;
        loans[loanId] = Loan({
            borrower: msg.sender,
            principal: amount,
            feeBps: feeBps,
            startedAt: uint64(block.timestamp),
            maturityAt: uint64(block.timestamp + uint256(tenorDays) * 1 days),
            repaid: false,
            defaulted: false
        });

        pool.lendTo(msg.sender, amount);
        emit LoanOpened(loanId, msg.sender, amount, tenorDays, feeBps, att.scoreId);
    }

    /// @notice Repay a loan. Principal goes back to the pool; loan fee is split
    ///         between the pool (lenders' yield) and the protocol treasury.
    function repay(uint256 loanId) external {
        Loan storage l = loans[loanId];
        require(l.borrower != address(0), "AVAL/no-loan");
        require(!l.repaid && !l.defaulted, "AVAL/loan-closed");
        require(l.borrower == msg.sender, "AVAL/not-borrower");

        uint256 fee = (l.principal * l.feeBps) / 10_000;
        uint256 protocolCut = (fee * protocolFeeBps) / 10_000;
        uint256 lenderCut = fee - protocolCut;
        uint256 total = l.principal + fee;

        l.repaid = true;
        outstanding[msg.sender] -= l.principal;

        // Principal + lender's share of the fee → pool (boosts share price).
        asset.safeTransferFrom(msg.sender, address(pool), l.principal + lenderCut);
        // Protocol cut → treasury (separate from pool).
        if (protocolCut > 0) {
            asset.safeTransferFrom(msg.sender, protocolTreasury, protocolCut);
        }

        emit LoanRepaid(loanId, total, protocolCut, lenderCut);
    }

    /// @notice Mark a loan as defaulted after maturity. Anyone can call.
    /// @dev v1 just realizes the loss against the pool (totalAssets drops).
    function markDefault(uint256 loanId) external {
        Loan storage l = loans[loanId];
        require(l.borrower != address(0), "AVAL/no-loan");
        require(!l.repaid && !l.defaulted, "AVAL/loan-closed");
        require(block.timestamp > l.maturityAt, "AVAL/not-matured");

        l.defaulted = true;
        outstanding[l.borrower] -= l.principal;

        emit LoanDefaulted(loanId);
    }

    // ---------- Owner-only protocol controls ----------

    function setProtocolFeeBps(uint16 bps) external onlyOwner {
        require(bps <= MAX_PROTOCOL_FEE_BPS, "AVAL/protocol-fee-too-high");
        uint16 old = protocolFeeBps;
        protocolFeeBps = bps;
        emit ProtocolFeeBpsUpdated(old, bps);
    }

    function setProtocolTreasury(address treasury) external onlyOwner {
        require(treasury != address(0), "AVAL/zero-treasury");
        address old = protocolTreasury;
        protocolTreasury = treasury;
        emit ProtocolTreasuryUpdated(old, treasury);
    }

    // ---------- Views ----------

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
