// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./PTBAEAllowanceToken.sol";

contract PTBAEFactory is AccessControl, ERC2771Context {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    // Custom Errors
    error InvalidOracleAddress();
    error InvalidSPEAddress();
    error PeriodAlreadyExists(uint32 period);

    uint32 public currentPeriod;
    address public immutable oracle;
    address public immutable speTokenAddress;
    mapping(uint32 => address) public tokenByPeriod;

    // Hybrid Compliance Configuration (shared across all periods)
    address public treasury;
    address public oracleSigner;
    address public idrsToken;

    event PeriodOpened(uint32 indexed period, address token);
    event PeriodFinalized(uint32 indexed period, address token);
    event HybridConfigUpdated(address treasury, address oracleSigner, address idrsToken);

    constructor(
        address admin, 
        address regulator, 
        uint32 initialPeriod, 
        address _forwarder,
        address _oracle,
        address _speToken
    )
        ERC2771Context(_forwarder)
    {
        if (_oracle == address(0)) revert InvalidOracleAddress();
        if (_speToken == address(0)) revert InvalidSPEAddress();
        oracle = _oracle;
        speTokenAddress = _speToken;
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);

        _openPeriod(initialPeriod, regulator, address(0)); // No previous period for initial
    }

    /**
     * @notice Set hybrid compliance configuration (treasury, oracleSigner, IDRS token)
     * @dev This config will be applied to all new periods created after this call
     */
    function setHybridConfig(address _treasury, address _oracleSigner, address _idrsToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
        oracleSigner = _oracleSigner;
        idrsToken = _idrsToken;
        emit HybridConfigUpdated(_treasury, _oracleSigner, _idrsToken);
    }

    /**
     * @notice Apply hybrid config to an existing period token
     */
    function configureExistingPeriod(uint32 period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address tokenAddr = tokenByPeriod[period];
        require(tokenAddr != address(0), "Period not found");
        _configureToken(PTBAEAllowanceToken(tokenAddr), period);
    }

    function openPeriod(uint32 newPeriod) external onlyRole(REGULATOR_ROLE) {
        if (tokenByPeriod[newPeriod] != address(0)) revert PeriodAlreadyExists(newPeriod);
        // Find the previous period token (if exists)
        address prevToken = tokenByPeriod[newPeriod - 1];
        _openPeriod(newPeriod, _msgSender(), prevToken);
    }

    function finalizePeriod(uint32 period) external onlyRole(REGULATOR_ROLE) {
        address token = tokenByPeriod[period];
        require(token != address(0), "Period not found");
        emit PeriodFinalized(period, token);
    }

    function _openPeriod(uint32 p, address regulator, address prevToken) internal {
        currentPeriod = p;
        // Make Factory the initial Admin so it can call setTreasury etc.
        PTBAEAllowanceToken token = new PTBAEAllowanceToken(
            address(this), // Factory is temporary Admin
            regulator, // Regulator role
            p,
            trustedForwarder(),
            oracle,
            speTokenAddress
        );
        tokenByPeriod[p] = address(token);
        
        // Auto-configure hybrid settings (now works because Factory is Admin)
        _configureToken(token, p);
        
        // Set previous period token
        if (prevToken != address(0)) {
            token.setPreviousPeriodToken(prevToken);
        }

        // Grant Admin role to the actual regulator
        token.grantRole(token.DEFAULT_ADMIN_ROLE(), regulator);
        
        // Renounce Factory's Admin role
        token.renounceRole(token.DEFAULT_ADMIN_ROLE(), address(this));
        
        emit PeriodOpened(p, address(token));
    }
    
    function _configureToken(PTBAEAllowanceToken token, uint32 /*period*/) internal {
        if (treasury != address(0)) {
            token.setTreasury(treasury);
        }
        if (oracleSigner != address(0)) {
            token.setOracleSigner(oracleSigner);
        }
        if (idrsToken != address(0)) {
            token.setIDRSToken(idrsToken);
        }
    }


    // Context overrides
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address sender) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view virtual override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
