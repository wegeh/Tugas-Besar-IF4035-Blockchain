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

    event PeriodOpened(uint32 indexed period, address token);

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

        _openPeriod(initialPeriod, regulator);
    }

    function openPeriod(uint32 newPeriod) external onlyRole(REGULATOR_ROLE) {
        if (tokenByPeriod[newPeriod] != address(0)) revert PeriodAlreadyExists(newPeriod);
        _openPeriod(newPeriod, _msgSender());
    }

    function _openPeriod(uint32 p, address regulator) internal {
        currentPeriod = p;
        PTBAEAllowanceToken token = new PTBAEAllowanceToken(
            regulator, // Admin of the token
            regulator, // Regulator of the token
            p,
            trustedForwarder(),
            oracle,     // MRV Oracle address
            speTokenAddress // SPE Token address
        );
        tokenByPeriod[p] = address(token);
        emit PeriodOpened(p, address(token));
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
