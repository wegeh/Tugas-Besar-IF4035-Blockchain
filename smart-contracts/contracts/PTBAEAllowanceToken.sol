// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./interfaces/IMRVOracle.sol";
import "./SPEGRKToken.sol";

contract PTBAEAllowanceToken is ERC20, AccessControl, ERC2771Context, ERC1155Holder {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    
    enum PeriodStatus { ACTIVE, AUDIT, ENDED }
    enum ComplianceStatus { NO_DATA, PENDING, COMPLIANT }
    
    uint32 public immutable period;
    IMRVOracle public immutable oracle;
    SPEGRKToken public immutable speToken;
    PeriodStatus public status = PeriodStatus.ACTIVE;

    mapping(address => uint256) public surrendered;
    mapping(address => ComplianceStatus) public complianceStatus;
    mapping(address => bool) public hasSurrendered;

    event Allocated(address indexed to, uint256 amount);
    event Surrendered(address indexed from, uint256 amount, uint256 remaining);
    event StatusChanged(uint32 period, PeriodStatus status);
    event ComplianceUpdated(address indexed user, ComplianceStatus status);

    // Custom Errors
    error PeriodNotActive();
    error InvalidRecipient();
    error InvalidAmount();
    error NoRecipients();
    error ArrayLengthMismatch();
    error SurrenderOnlyInAuditPhase();
    error VintageTooNew(uint16 vintage, uint32 period);
    error NoVerifiedEmissionData();
    error AlreadySurrendered();
    error InsufficientPTBAEBalance(uint256 available, uint256 required);
    error NotActive();
    error AlreadyEnded();
    error TransferRestricted();

    constructor(
        address admin, 
        address regulator, 
        uint32 _period, 
        address trustedForwarder,
        address _oracle,
        address _speToken
    )
        ERC20("PTBAE-PU Allowance", "PTBAE")
        ERC2771Context(trustedForwarder)
    {
        period = _period;
        oracle = IMRVOracle(_oracle);
        speToken = SPEGRKToken(_speToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
    }

    function allocate(address to, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        if (status != PeriodStatus.ACTIVE) revert PeriodNotActive();
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        _mint(to, amount);
        emit Allocated(to, amount);
    }

    function batchAllocate(address[] calldata recipients, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        if (status != PeriodStatus.ACTIVE) revert PeriodNotActive();
        if (amount == 0) revert InvalidAmount();
        if (recipients.length == 0) revert NoRecipients();
        
        for (uint256 i = 0; i < recipients.length; i++) {
            address to = recipients[i];
            if (to != address(0)) {
                _mint(to, amount);
                emit Allocated(to, amount);
            }
        }
    }

    /**
     * @notice Surrender normal (hanya bayar pakai PTBAE balance sendiri)
     */
    function surrender() external {
        _performSurrender(_msgSender(), 0);
    }

    /**
     * @notice Surrender dengan kombinasi SPE-GRK (Offset Carbon Credit)
     * @dev User harus approve PTBAE contract di SPE contract dulu.
     */
    function surrenderWithOffset(uint256[] calldata speIds, uint256[] calldata speAmounts) external {
        uint256 totalOffset = 0;

        if (speIds.length != speAmounts.length) revert ArrayLengthMismatch();
        if (status != PeriodStatus.AUDIT) revert SurrenderOnlyInAuditPhase();

        // Process each SPE token
        for (uint256 i = 0; i < speIds.length; i++) {
            uint256 id = speIds[i];
            uint256 amt = speAmounts[i];

            if (amt > 0) {
                // 1. Validate Vintage Year <= Compliance Period
                (SPEGRKToken.UnitMeta memory meta, , , , , ) = speToken.getUnit(id);
                if (meta.vintageYear > period) revert VintageTooNew(meta.vintageYear, period);

                // 2. Transfer SPE from User to Contract
                speToken.safeTransferFrom(_msgSender(), address(this), id, amt, "");

                // 3. Retire/Burn SPE (since contract is now owner)
                speToken.retireSPE(id, amt);

                totalOffset += amt;
            }
        }

        // Perform rest of surrender logic
        _performSurrender(_msgSender(), totalOffset);
    }

    function _performSurrender(address user, uint256 offsetAmount) internal {
        // 1. Check phase
        if (status != PeriodStatus.AUDIT) revert SurrenderOnlyInAuditPhase();
        
        // 2. Get verified emission (tagihan) from Oracle
        uint256 tagihan = oracle.getVerifiedEmission(period, user);
        if (tagihan == 0) revert NoVerifiedEmissionData();
        
        // 3. Check if already paid
        if (hasSurrendered[user]) revert AlreadySurrendered();
        
        // 4. Calculate remaining to pay with PTBAE
        uint256 remainingToPay = 0;
        if (tagihan > offsetAmount) {
            remainingToPay = tagihan - offsetAmount;
        }

        // 5. Check PTBAE balance if needed
        if (remainingToPay > 0) {
            uint256 bal = balanceOf(user);
            if (bal < remainingToPay) revert InsufficientPTBAEBalance(bal, remainingToPay);
            _burn(user, remainingToPay);
        }
        
        // 6. Record & Update
        surrendered[user] = tagihan; // Marked as full obligation met
        hasSurrendered[user] = true;
        
        // 7. Update compliance status
        complianceStatus[user] = ComplianceStatus.COMPLIANT;
        emit ComplianceUpdated(user, ComplianceStatus.COMPLIANT);
        
        emit Surrendered(user, tagihan, 0);
    }

    /**
     * @notice Get compliance info untuk user
     */
    function getCompliance(address account)
        external
        view
        returns (
            uint32 p, 
            uint256 balance, 
            uint256 surrenderedAmt,
            uint256 verifiedEmission,
            uint256 debt,
            ComplianceStatus cStatus
        )
    {
        uint256 emission = oracle.getVerifiedEmission(period, account);
        uint256 paid = surrendered[account];
        uint256 remaining = emission > paid ? emission - paid : 0;
        
        ComplianceStatus cs = complianceStatus[account];
        if (emission == 0) {
            cs = ComplianceStatus.NO_DATA;
        } else if (paid >= emission) {
            cs = ComplianceStatus.COMPLIANT;
        } else {
            cs = ComplianceStatus.PENDING;
        }
        
        return (period, balanceOf(account), paid, emission, remaining, cs);
    }

    function setAudit() external onlyRole(REGULATOR_ROLE) {
        if (status != PeriodStatus.ACTIVE) revert NotActive();
        status = PeriodStatus.AUDIT;
        emit StatusChanged(period, status);
    }

    function finalize() external onlyRole(REGULATOR_ROLE) {
        if (status == PeriodStatus.ENDED) revert AlreadyEnded();
        status = PeriodStatus.ENDED;
        emit StatusChanged(period, status);
    }

    // ERC20 Hook to enforce rules
    function _update(address from, address to, uint256 value) internal override(ERC20) {
        if (from != address(0) && to != address(0)) {
            // Normal Transfer: Allowed ONLY in ACTIVE
            if (status != PeriodStatus.ACTIVE) revert TransferRestricted();
        }
        // Mint (from=0) and Burn (to=0) logic is controlled by allocate/surrender functions
        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(ERC2771Context, Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
