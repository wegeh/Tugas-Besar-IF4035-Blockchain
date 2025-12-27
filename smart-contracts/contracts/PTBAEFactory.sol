// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./PTBAEAllowanceToken.sol";

contract PTBAEFactory is AccessControl {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    uint32 public currentPeriod;
    mapping(uint32 => address) public tokenByPeriod;

    event PeriodOpened(uint32 indexed period, address token);

    constructor(address admin, address regulator, uint32 initialPeriod) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
        _openPeriod(initialPeriod, regulator);
    }

    function openPeriod(uint32 newPeriod) external onlyRole(REGULATOR_ROLE) {
        require(tokenByPeriod[newPeriod] == address(0), "period exists");
        _openPeriod(newPeriod, msg.sender);
    }

    function _openPeriod(uint32 p, address regulator) internal {
        currentPeriod = p;
        PTBAEAllowanceToken token = new PTBAEAllowanceToken(
            regulator, // Admin of the token
            regulator, // Regulator of the token
            p
        );
        tokenByPeriod[p] = address(token);
        emit PeriodOpened(p, address(token));
    }
}
