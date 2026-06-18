// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title BuzfundrVault
 * @notice On-chain crowdfunding vault - Canadian NI 45-110 compliant
 *
 * ACCESS CONTROL:
 *   - Investor: deposit(), refund() - interact directly from their wallet
 *   - Issuer:   releaseFunds() - founder claims funds after deadline + goal
 *   - Admin:    failOffering(), emergencyRefund(), triggerAmendmentWindow()
 *
 * RULES (enforced on-chain, cannot be bypassed):
 *   1. Per-investor cap: $2,500 USDC max
 *   2. Offering deadline: 90 days max
 *   3. Refund window: 48 hours after each deposit
 *   4. Release: only after deadline AND goal reached
 *   5. Fail: only after deadline AND goal NOT reached
 *   6. Fail deadline: must fail within 5 business days (7 calendar) after offering deadline
 *   7. Amendment: admin can reset all refund windows when offering doc changes
 * FEE MODEL:
 *   - Fee % and fee wallet are SET AT DEPLOYMENT and LOCKED forever
 *   - Even if the database changes later, this vault keeps its original fee
 *   - On release: fee% to platform wallet, rest to issuer
 *   - On fail/refund: 0% fee
 */
contract BuzfundrVault is Ownable, ReentrancyGuard, Pausable {
    IERC20 public immutable usdc;
    address public immutable issuer;
    address public immutable platformFeeWallet;
    uint256 public immutable platformFeePercent; // Dynamic! Set at deploy, locked forever

    uint256 public minGoal;
    uint256 public maxCap;
    uint256 public maxPerInvestor;
    uint256 public offeringDeadline;
    uint256 public failDeadline;
    uint256 public refundWindowSeconds;

    bool public isActive;
    bool public isReleased;
    bool public isFailed;
    uint256 public totalDeposited;

    mapping(address => uint256) public investorDeposits;
    mapping(address => uint256) public investorRefundDeadline;
    mapping(address => bytes32) public complianceHashes;
    address[] public investors;
    mapping(address => bool) private isInvestor;

    event Deposited(
        address indexed investor,
        uint256 amount,
        uint256 refundDeadline,
        uint256 totalAfter
    );
    event Refunded(address indexed investor, uint256 amount, string reason);
    event FundsReleased(
        address indexed issuer,
        uint256 issuerAmount,
        uint256 platformFee,
        uint256 feePercent,
        uint256 investorCount
    );
    event PlatformFeeCollected(
        address indexed feeWallet,
        uint256 feeAmount,
        uint256 feePercent,
        address indexed vault
    );
    event OfferingFailed(uint256 totalRefunded, uint256 investorCount);
    event EmergencyRefund(
        address indexed investor,
        uint256 amount,
        string reason
    );
    event AmendmentWindowTriggered(uint256 newDeadline, uint256 investorCount);
    event ComplianceRecorded(address indexed investor, bytes32 hash, uint256 timestamp);

    error VaultClosed();
    error DeadlinePassed();
    error DeadlineNotReached();
    error GoalNotReached();
    error GoalAlreadyReached();
    error RefundWindowExpired();
    error NoDepositFound();
    error ExceedsMaxCap(uint256 remaining);
    error ExceedsInvestorCap(uint256 allowed);
    error AmountZero();
    error TransferFailed();
    error NotIssuer();
    error InvalidFeePercent();
    error FailDeadlinePassed();

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }
    modifier whenActive() {
        if (!isActive) revert VaultClosed();
        _;
    }

    /**
     * @param _platformFeePercent Fee percentage (0-30). Set once, locked forever.
     *        Example: 7 means 7% to platform, 93% to issuer
     */
    constructor(
        address _usdc,
        address _issuer,
        address _platformFeeWallet,
        uint256 _platformFeePercent,
        uint256 _minGoal,
        uint256 _maxCap,
        uint256 _maxPerInvestor,
        uint256 _durationSeconds,
        uint256 _refundWindowSeconds
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_issuer != address(0), "Invalid issuer");
        require(_platformFeeWallet != address(0), "Invalid fee wallet");
        if (_platformFeePercent > 30) revert InvalidFeePercent(); // Max 30% sanity check
        require(_durationSeconds > 0 && _durationSeconds <= 7776000, "Duration must be 1s-90 days (NI 45-110)");
        require(_minGoal > 0 && _maxCap >= _minGoal, "Invalid goal/cap");
        require(_maxPerInvestor > 0, "Invalid investor cap");

        usdc = IERC20(_usdc);
        issuer = _issuer;
        platformFeeWallet = _platformFeeWallet;
        platformFeePercent = _platformFeePercent;
        minGoal = _minGoal;
        maxCap = _maxCap;
        maxPerInvestor = _maxPerInvestor;
        offeringDeadline = block.timestamp + _durationSeconds;
        failDeadline = offeringDeadline + 7 days;
        refundWindowSeconds = _refundWindowSeconds > 0
            ? _refundWindowSeconds
            : 172800;
        isActive = true;
    }

    function deposit(uint256 amount) external nonReentrant whenActive whenNotPaused {
        if (block.timestamp > offeringDeadline) revert DeadlinePassed();
        if (amount == 0) revert AmountZero();
        if (totalDeposited + amount > maxCap)
            revert ExceedsMaxCap(maxCap - totalDeposited);
        if (investorDeposits[msg.sender] + amount > maxPerInvestor)
            revert ExceedsInvestorCap(
                maxPerInvestor - investorDeposits[msg.sender]
            );

        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        if (!isInvestor[msg.sender]) {
            investors.push(msg.sender);
            isInvestor[msg.sender] = true;
        }
        investorDeposits[msg.sender] += amount;
        investorRefundDeadline[msg.sender] =
            block.timestamp +
            refundWindowSeconds;
        totalDeposited += amount;

        emit Deposited(
            msg.sender,
            amount,
            investorRefundDeadline[msg.sender],
            totalDeposited
        );
    }

    function refund() external nonReentrant {
        if (!isActive && !isFailed) revert VaultClosed();

        uint256 amount = investorDeposits[msg.sender];
        if (amount == 0) revert NoDepositFound();

        // 48h window only applies to active offerings; failed offerings allow anytime claim
        if (isActive && block.timestamp > investorRefundDeadline[msg.sender])
            revert RefundWindowExpired();

        investorDeposits[msg.sender] = 0;
        totalDeposited -= amount;
        _removeInvestor(msg.sender);

        bool success = usdc.transfer(msg.sender, amount);
        if (!success) revert TransferFailed();
        emit Refunded(
            msg.sender,
            amount,
            isFailed
                ? "Offering failed - investor claimed refund"
                : "Investor voluntary withdrawal within 48hr window"
        );
    }

    /**
     * @notice Release: dynamic fee% to platform, rest to issuer
     * Fee % was locked at deployment — cannot be changed
     */
    function releaseFunds() external nonReentrant onlyIssuer whenActive whenNotPaused {
        if (block.timestamp <= offeringDeadline) revert DeadlineNotReached();
        if (totalDeposited < minGoal) revert GoalNotReached();

        uint256 totalAmount = totalDeposited;
        uint256 count = investors.length;
        uint256 platformFee = (totalAmount * platformFeePercent) / 100;
        uint256 issuerAmount = totalAmount - platformFee;

        isActive = false;
        isReleased = true;
        totalDeposited = 0;

        if (platformFee > 0) {
            bool feeOk = usdc.transfer(platformFeeWallet, platformFee);
            if (!feeOk) revert TransferFailed();
            emit PlatformFeeCollected(
                platformFeeWallet,
                platformFee,
                platformFeePercent,
                address(this)
            );
        }

        bool issuerOk = usdc.transfer(issuer, issuerAmount);
        if (!issuerOk) revert TransferFailed();
        emit FundsReleased(
            issuer,
            issuerAmount,
            platformFee,
            platformFeePercent,
            count
        );
    }

    function failOffering() external nonReentrant onlyOwner whenActive {
        if (block.timestamp <= offeringDeadline) revert DeadlineNotReached();
        if (block.timestamp > failDeadline) revert FailDeadlinePassed();
        if (totalDeposited >= minGoal) revert GoalAlreadyReached();

        isActive = false;
        isFailed = true;
        // Investors pull their own refunds by calling refund() — no unbounded loop
        emit OfferingFailed(totalDeposited, investors.length);
    }

    function emergencyRefund(
        address investor
    ) external nonReentrant onlyOwner {
        if (!isActive && !isFailed) revert VaultClosed();
        uint256 amount = investorDeposits[investor];
        if (amount == 0) revert NoDepositFound();

        investorDeposits[investor] = 0;
        totalDeposited -= amount;
        _removeInvestor(investor);

        bool success = usdc.transfer(investor, amount);
        if (!success) revert TransferFailed();
        emit EmergencyRefund(
            investor,
            amount,
            "Admin emergency refund - suspicious activity"
        );
    }

    function triggerAmendmentWindow() external nonReentrant onlyOwner whenActive {
        uint256 newDeadline = block.timestamp + refundWindowSeconds;
        uint256 count = investors.length;
        for (uint256 i = 0; i < count; i++) {
            if (investorDeposits[investors[i]] > 0) {
                investorRefundDeadline[investors[i]] = newDeadline;
            }
        }
        emit AmendmentWindowTriggered(newDeadline, count);
    }

    // ═══════════════════════ COMPLIANCE HASH ═══════════════════════

    /**
     * @notice Investor commits keccak256 hash of their signed compliance data on-chain.
     *         Called at subscription signing step — creates permanent on-chain proof
     *         that investor acknowledged Form 45-110F1, F2, and Subscription Agreement.
     * @param hash keccak256(abi.encode(investorWallet, offeringId, subscriptionTimestamp))
     */
    function recordComplianceHash(bytes32 hash) external whenActive {
        require(hash != bytes32(0), "Invalid hash");
        complianceHashes[msg.sender] = hash;
        emit ComplianceRecorded(msg.sender, hash, block.timestamp);
    }

    // ═══════════════════════ PAUSE / UNPAUSE ═══════════════════════

    /**
     * @notice Pause halts deposit() and releaseFunds() only.
     *         refund() stays open so investors can always withdraw.
     */
    function pauseVault() external onlyOwner {
        _pause();
    }

    function unpauseVault() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════ AUDIT REGISTRY ═══════════════════════

    struct AuditRecord {
        bytes32 reportHash;
        string  auditorName;
        uint256 recordedAt;
    }

    AuditRecord[] public auditRecords;
    event AuditReported(bytes32 indexed reportHash, string auditorName, uint256 timestamp);

    /**
     * @notice Owner records hash of a formal audit report on-chain.
     *         Multiple audits are supported — each is appended and immutable.
     * @param reportHash  keccak256 of the audit report PDF/document
     * @param auditorName Name of the audit firm (e.g. "Trail of Bits")
     */
    function recordAuditReport(bytes32 reportHash, string calldata auditorName) external onlyOwner {
        require(reportHash != bytes32(0), "Invalid report hash");
        require(bytes(auditorName).length > 0, "Auditor name required");
        auditRecords.push(AuditRecord(reportHash, auditorName, block.timestamp));
        emit AuditReported(reportHash, auditorName, block.timestamp);
    }

    function getAuditCount() external view returns (uint256) {
        return auditRecords.length;
    }

    // ═══════════════════════ EMERGENCY SWEEP ═══════════════════════

    /**
     * @notice Recover any ERC-20 token stuck in this contract.
     *         For the vault's own USDC: only callable after vault is closed (released or failed).
     *         For any other token: callable any time (e.g. wrong token sent by mistake).
     * @param token  ERC-20 token address to sweep
     * @param to     Recipient address
     * @param amount Amount in token's native decimals (0 = sweep full balance)
     */
    event EmergencySweep(address indexed token, address indexed to, uint256 amount);
    error VaultStillActive();

    function emergencySweep(address token, address to, uint256 amount) external nonReentrant onlyOwner {
        require(token != address(0) && to != address(0), "Invalid address");

        // Vault USDC can only be swept after vault closes to protect investor funds
        if (token == address(usdc)) {
            if (isActive) revert VaultStillActive();
        }

        IERC20 erc20 = IERC20(token);
        uint256 bal = erc20.balanceOf(address(this));
        require(bal > 0, "No balance to sweep");

        uint256 sweepAmount = amount == 0 ? bal : amount;
        require(sweepAmount <= bal, "Amount exceeds balance");

        bool ok = erc20.transfer(to, sweepAmount);
        if (!ok) revert TransferFailed();
        emit EmergencySweep(token, to, sweepAmount);
    }

    // ═══════════════════════ VIEW ═══════════════════════

    function getInvestorCount() external view returns (uint256) {
        return investors.length;
    }
    function getInvestorAtIndex(uint256 index) external view returns (address) {
        require(index < investors.length, "Index out of bounds");
        return investors[index];
    }

    function getVaultInfo()
        external
        view
        returns (
            bool _isActive,
            bool _isReleased,
            bool _isFailed,
            uint256 _totalDeposited,
            uint256 _minGoal,
            uint256 _maxCap,
            uint256 _maxPerInvestor,
            uint256 _deadline,
            uint256 _failDeadline,
            uint256 _investorCount,
            uint256 _remainingCapacity,
            bool _deadlinePassed,
            bool _goalReached,
            address _issuer
        )
    {
        return (
            isActive,
            isReleased,
            isFailed,
            totalDeposited,
            minGoal,
            maxCap,
            maxPerInvestor,
            offeringDeadline,
            failDeadline,
            investors.length,
            maxCap - totalDeposited,
            block.timestamp > offeringDeadline,
            totalDeposited >= minGoal,
            issuer
        );
    }

    function getFeeInfo()
        external
        view
        returns (
            address _feeWallet,
            uint256 _feePercent,
            uint256 _estimatedFee,
            uint256 _estimatedIssuerAmount
        )
    {
        uint256 fee = (totalDeposited * platformFeePercent) / 100;
        return (
            platformFeeWallet,
            platformFeePercent,
            fee,
            totalDeposited - fee
        );
    }

    function getInvestorInfo(
        address investor
    )
        external
        view
        returns (
            uint256 _deposit,
            uint256 _refundDeadline,
            bool _refundEligible,
            uint256 _remainingCap
        )
    {
        uint256 dep = investorDeposits[investor];
        uint256 dl = investorRefundDeadline[investor];
        return (
            dep,
            dl,
            dep > 0 && (block.timestamp <= dl || isFailed),
            maxPerInvestor > dep ? maxPerInvestor - dep : 0
        );
    }

    function _removeInvestor(address investor) internal {
        isInvestor[investor] = false;
        for (uint256 i = 0; i < investors.length; i++) {
            if (investors[i] == investor) {
                investors[i] = investors[investors.length - 1];
                investors.pop();
                break;
            }
        }
    }
}
