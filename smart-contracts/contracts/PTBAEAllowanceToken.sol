// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./interfaces/IMRVOracle.sol";
import "./SPEGRKToken.sol";

/**
 * @title PTBAEAllowanceToken
 * @notice ERC20 token for PTBAE compliance with hybrid SPE offset and cross-period burn
 */
contract PTBAEAllowanceToken is ERC20, AccessControl, ERC2771Context, ERC1155Holder {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    
    enum PeriodStatus { ACTIVE, AUDIT, ENDED }
    enum ComplianceStatus { NO_DATA, PENDING, COMPLIANT, NON_COMPLIANT }
    
    uint32 public immutable period;
    IMRVOracle public immutable oracle;
    SPEGRKToken public immutable speToken;
    PeriodStatus public status = PeriodStatus.ACTIVE;

    mapping(address => uint256) public surrendered;
    mapping(address => ComplianceStatus) public complianceStatus;
    mapping(address => bool) public hasSurrendered;
    mapping(address => uint256) public carbonDebt;  // Debt in wei for non-compliant users

    // IDRS & Debt Integration
    address public treasury;
    address public oracleSigner;
    IERC20 public idrsToken;
    PTBAEAllowanceToken public previousPeriodToken;

    event IDRSPayment(address indexed user, uint256 idrsAmount, uint256 tonsOffset);
    event Allocated(address indexed to, uint256 amount);
    event Surrendered(address indexed from, uint256 amount, uint256 remaining);
    event StatusChanged(uint32 period, PeriodStatus status);
    event ComplianceUpdated(address indexed user, ComplianceStatus status);
    event BurnedForCompliance(address indexed user, uint256 amount, uint32 fromPeriod, uint32 forPeriod);
    event NonCompliantMarked(address indexed user, uint256 emission, uint256 surrendered, uint256 debt);

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
        require(status == PeriodStatus.ACTIVE, "Not active");
        require(to != address(0) && amount > 0, "Invalid");
        _mint(to, amount);
        emit Allocated(to, amount);
    }

    function batchAllocate(address[] calldata recipients, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        require(status == PeriodStatus.ACTIVE && amount > 0 && recipients.length > 0, "Invalid");
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0)) {
                _mint(recipients[i], amount);
                emit Allocated(recipients[i], amount);
            }
        }
    }

    // Setters for new config
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
    }

    function setIDRSToken(address _idrsToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        idrsToken = IERC20(_idrsToken);
    }

    function setOracleSigner(address _signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        oracleSigner = _signer;
    }

    function setPreviousPeriodToken(address _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        previousPeriodToken = PTBAEAllowanceToken(_token);
    }


    /**
     * @notice Burn tokens from this period for compliance in a target period
     */
    function burnForCompliance(address user, uint256 amount, uint32 targetPeriod) external {
        require(_msgSender() == user, "Only owner");
        require(period <= targetPeriod && amount > 0, "Invalid");
        require(balanceOf(user) >= amount, "Insufficient");
        _burn(user, amount);
        emit BurnedForCompliance(user, amount, period, targetPeriod);
    }

    /**
     * @notice Mark compliance complete after cross-period burns (called after burnForCompliance)
     */
    function markComplianceComplete(address user) external {
        require(_msgSender() == user, "Only owner");
        require(status == PeriodStatus.AUDIT, "Not audit");
        uint256 tagihan = oracle.getVerifiedEmission(period, user);
        require(tagihan > 0, "No emission");
        require(!hasSurrendered[user], "Already done");
        
        surrendered[user] = tagihan;
        hasSurrendered[user] = true;
        complianceStatus[user] = ComplianceStatus.COMPLIANT;
        emit ComplianceUpdated(user, ComplianceStatus.COMPLIANT);
        emit Surrendered(user, tagihan, 0);
    }

    /**
     * @notice Surrender with Hybrid payment (SPE + Cross-Period + IDRS + Current PTBAE + Debt)
     */
    function surrenderHybrid(
        uint256[] calldata speIds, 
        uint256[] calldata speAmounts,
        uint256 alreadyPaidFromOtherPeriods,
        uint256 idrsPaymentAmount,
        uint256 rate,
        uint256 timestamp,
        bytes memory signature
    ) external {
        require(status == PeriodStatus.AUDIT, "Not audit");
        
        address user = _msgSender();
        uint256 currentEmission = oracle.getVerifiedEmission(period, user);
        require(currentEmission > 0, "No emission");
        require(!hasSurrendered[user], "Already done");

        // 1. Calculate Total Obligation (Current + Previous Debt)
        uint256 priorDebt = 0;
        if (address(previousPeriodToken) != address(0)) {
            (,, priorDebt,) = previousPeriodToken.getDebtInfo(user);
        }
        uint256 totalTagihan = currentEmission + priorDebt;

        uint256 totalOffset = alreadyPaidFromOtherPeriods;

        // 2. Process SPE tokens
        for (uint256 i = 0; i < speIds.length; i++) {
            uint256 id = speIds[i];
            uint256 amt = speAmounts[i];
            if (amt > 0) {
                (SPEGRKToken.UnitMeta memory meta, , , , , ) = speToken.getUnit(id);
                require(meta.vintageYear <= period, "Vintage too new");
                // SPE tokens are valid forever - no expiry check

                speToken.safeTransferFrom(user, address(this), id, amt, "");
                speToken.retireSPE(id, amt);
                totalOffset += amt;
            }
        }

        // 3. Process IDRS Payment
        if (idrsPaymentAmount > 0) {
            require(address(idrsToken) != address(0) && treasury != address(0), "IDRS not setup");
            require(block.timestamp - timestamp < 600, "Price expired"); 
            require(_verifyPriceSignature(rate, timestamp, signature), "Inv sig");

            uint256 idrsTons = (idrsPaymentAmount * 1e18) / rate;
            require(idrsToken.transferFrom(user, treasury, idrsPaymentAmount), "Trf fail");
            
            totalOffset += idrsTons;
            emit IDRSPayment(user, idrsPaymentAmount, idrsTons);
        }

        // 4. Calculate remaining to pay with PTBAE
        uint256 remaining = totalTagihan > totalOffset ? totalTagihan - totalOffset : 0;
        
        if (remaining > 0) {
            uint256 bal = balanceOf(user);
            require(bal >= remaining, "Insufficient PTBAE");
            _burn(user, remaining);
        }

        surrendered[user] = totalTagihan;
        hasSurrendered[user] = true;
        complianceStatus[user] = ComplianceStatus.COMPLIANT;
        emit ComplianceUpdated(user, ComplianceStatus.COMPLIANT);
        emit Surrendered(user, totalTagihan, 0);
    }

    function _verifyPriceSignature(uint256 rate, uint256 ts, bytes memory sig) internal view returns (bool) {
        bytes32 hash = keccak256(abi.encodePacked(rate, ts));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (bytes32 r, bytes32 s, uint8 v) = _splitSignature(sig);
        return ecrecover(ethHash, v, r, s) == oracleSigner;
    }

    function _splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "inv sig len");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    /**
     * @notice Legacy surrender (single period, no SPE)
     */
    function surrender() external {
        require(status == PeriodStatus.AUDIT, "Not audit");
        address user = _msgSender();
        uint256 tagihan = oracle.getVerifiedEmission(period, user);
        require(tagihan > 0, "No emission");
        require(!hasSurrendered[user], "Already done");
        
        uint256 bal = balanceOf(user);
        require(bal >= tagihan, "Insufficient");
        _burn(user, tagihan);
        
        surrendered[user] = tagihan;
        hasSurrendered[user] = true;
        complianceStatus[user] = ComplianceStatus.COMPLIANT;
        emit ComplianceUpdated(user, ComplianceStatus.COMPLIANT);
        emit Surrendered(user, tagihan, 0);
    }

    function getCompliance(address account)
        external view
        returns (uint32, uint256, uint256, uint256, uint256, ComplianceStatus)
    {
        uint256 emission = oracle.getVerifiedEmission(period, account);
        uint256 paid = surrendered[account];
        uint256 remaining = emission > paid ? emission - paid : 0;
        
        ComplianceStatus cs = complianceStatus[account];
        
        if (status == PeriodStatus.ENDED) {
            // Priority Check: Period Ended
            if (emission == 0 && paid == 0) {
                // NO DATA -> Flat Penalty 1000 Ton
                cs = ComplianceStatus.NON_COMPLIANT;
                remaining = 1000 * 10**18;
            } else if (paid < emission) {
                cs = ComplianceStatus.NON_COMPLIANT;
            } else {
                cs = ComplianceStatus.COMPLIANT;
            }
        } else {
            // Active / Audit
            if (emission == 0) {
                cs = ComplianceStatus.NO_DATA;
            } else if (paid >= emission) {
                cs = ComplianceStatus.COMPLIANT;
            } else {
                cs = ComplianceStatus.PENDING;
            }
        }
            
        return (period, balanceOf(account), paid, emission, remaining, cs);
    }

    function setAudit() external onlyRole(REGULATOR_ROLE) {
        require(status == PeriodStatus.ACTIVE, "Not active");
        status = PeriodStatus.AUDIT;
        emit StatusChanged(period, status);
    }

    function finalize() external onlyRole(REGULATOR_ROLE) {
        require(status != PeriodStatus.ENDED, "Already ended");
        status = PeriodStatus.ENDED;
        emit StatusChanged(period, status);
    }

    /**
     * @notice Mark users as non-compliant after period ends (called by regulator)
     * @param users Array of user addresses to check and mark
     */
    function markNonCompliant(address[] calldata users) external onlyRole(REGULATOR_ROLE) {
        require(status == PeriodStatus.ENDED, "Period not ended");
        
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 emission = oracle.getVerifiedEmission(period, user);
            uint256 paid = surrendered[user];
            
            // Logic: If No Data (emission 0) OR Shortfall -> Mark Non-Compliant + Debt
            if (emission == 0 && paid == 0) {
                 // Flat Penalty 1000
                 uint256 penalty = 1000 * 10**18;
                 carbonDebt[user] = penalty;
                 complianceStatus[user] = ComplianceStatus.NON_COMPLIANT;
                 emit NonCompliantMarked(user, 0, 0, penalty);
                 emit ComplianceUpdated(user, ComplianceStatus.NON_COMPLIANT);
            } else if (emission > 0 && paid < emission) {
                uint256 debt = emission - paid;
                carbonDebt[user] = debt;
                complianceStatus[user] = ComplianceStatus.NON_COMPLIANT;
                emit NonCompliantMarked(user, emission, paid, debt);
                emit ComplianceUpdated(user, ComplianceStatus.NON_COMPLIANT);
            }
        }
    }

    /**
     * @notice Get debt info for a user (Auto-calculate if ended)
     */
    function getDebtInfo(address user) external view returns (uint256 emission, uint256 paid, uint256 debt, ComplianceStatus cs) {
        emission = oracle.getVerifiedEmission(period, user);
        paid = surrendered[user];
        
        // Auto-calculate debt if period ended
        if (status == PeriodStatus.ENDED) {
             if (emission == 0 && paid == 0) {
                 // No Data -> Flat Penalty
                 debt = 1000 * 10**18;
                 cs = ComplianceStatus.NON_COMPLIANT;
             } else if (emission > paid) {
                debt = emission - paid;
                cs = ComplianceStatus.NON_COMPLIANT;
            } else {
                debt = 0;
                cs = ComplianceStatus.COMPLIANT;
            }
        } else {
            debt = carbonDebt[user]; // Fallback to stored debt
            cs = complianceStatus[user];
        }
    }

    function _update(address from, address to, uint256 value) internal override(ERC20) {
        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
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
