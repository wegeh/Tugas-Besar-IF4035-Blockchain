// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./interfaces/IMRVOracle.sol";

contract PTBAEAllowanceToken is ERC20, AccessControl, ERC2771Context {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    
    enum PeriodStatus { ACTIVE, AUDIT, ENDED }
    enum ComplianceStatus { NO_DATA, PENDING, COMPLIANT }
    
    uint32 public immutable period;
    IMRVOracle public immutable oracle;
    PeriodStatus public status = PeriodStatus.ACTIVE;

    mapping(address => uint256) public surrendered;
    mapping(address => ComplianceStatus) public complianceStatus;
    mapping(address => bool) public hasSurrendered;

    event Allocated(address indexed to, uint256 amount);
    event Surrendered(address indexed from, uint256 amount, uint256 remaining);
    event StatusChanged(uint32 period, PeriodStatus status);
    event ComplianceUpdated(address indexed user, ComplianceStatus status);

    constructor(
        address admin, 
        address regulator, 
        uint32 _period, 
        address trustedForwarder,
        address _oracle
    )
        ERC20("PTBAE-PU Allowance", "PTBAE")
        ERC2771Context(trustedForwarder)
    {
        period = _period;
        oracle = IMRVOracle(_oracle);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
    }

    function allocate(address to, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        require(status == PeriodStatus.ACTIVE, "period not active");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        _mint(to, amount);
        emit Allocated(to, amount);
    }

    function batchAllocate(address[] calldata recipients, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        require(status == PeriodStatus.ACTIVE, "period not active");
        require(amount > 0, "amount=0");
        require(recipients.length > 0, "no recipients");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            address to = recipients[i];
            if (to != address(0)) {
                _mint(to, amount);
                emit Allocated(to, amount);
            }
        }
    }

    /**
     * @notice Surrender PTBAE tokens untuk memenuhi kewajiban emisi
     * @dev Otomatis bayar SELURUH tagihan dari Oracle. Tidak ada parameter.
     *      Company hanya perlu klik satu tombol untuk bayar tagihan.
     */
    function surrender() external {
        // 1. Check phase
        require(status == PeriodStatus.AUDIT, "surrender only allowed in audit phase");
        
        // 2. Get verified emission (tagihan) from Oracle
        uint256 tagihan = oracle.getVerifiedEmission(period, _msgSender());
        require(tagihan > 0, "no verified emission data");
        
        // 3. Check if already paid
        require(!hasSurrendered[_msgSender()], "already surrendered");
        
        // 4. Check balance
        require(balanceOf(_msgSender()) >= tagihan, "insufficient balance");
        
        // 5. Execute surrender - burn full tagihan amount
        _burn(_msgSender(), tagihan);
        surrendered[_msgSender()] = tagihan;
        hasSurrendered[_msgSender()] = true;
        
        // 6. Update compliance status
        complianceStatus[_msgSender()] = ComplianceStatus.COMPLIANT;
        emit ComplianceUpdated(_msgSender(), ComplianceStatus.COMPLIANT);
        
        emit Surrendered(_msgSender(), tagihan, 0);
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
        require(status == PeriodStatus.ACTIVE, "not active");
        status = PeriodStatus.AUDIT;
        emit StatusChanged(period, status);
    }

    function finalize() external onlyRole(REGULATOR_ROLE) {
        require(status != PeriodStatus.ENDED, "already ended");
        status = PeriodStatus.ENDED;
        emit StatusChanged(period, status);
    }

    // ERC20 Hook to enforce rules
    function _update(address from, address to, uint256 value) internal override(ERC20) {
        if (from != address(0) && to != address(0)) {
            // Normal Transfer: Allowed ONLY in ACTIVE
            require(status == PeriodStatus.ACTIVE, "transfer restricted");
        }
        // Mint (from=0) and Burn (to=0) logic is controlled by allocate/surrender functions
        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
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
