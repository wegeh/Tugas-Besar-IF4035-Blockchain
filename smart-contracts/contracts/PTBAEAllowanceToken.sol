// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract PTBAEAllowanceToken is ERC20, AccessControl, ERC2771Context {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    uint32 public immutable period;
    bool public isEnded = false;

    mapping(address => uint256) public surrendered;

    event Allocated(address indexed to, uint256 amount);
    event Surrendered(address indexed from, uint256 amount);
    event PeriodEnded(uint32 period);

    constructor(address admin, address regulator, uint32 _period, address trustedForwarder)
        ERC20("PTBAE-PU Allowance", "PTBAE")
        ERC2771Context(trustedForwarder)
    {
        period = _period;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
    }

    function allocate(address to, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        require(!isEnded, "period ended");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        _mint(to, amount);
        emit Allocated(to, amount);
    }

    function batchAllocate(address[] calldata recipients, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        require(!isEnded, "period ended");
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

    function surrender(uint256 amount) external {
        require(amount > 0, "amount=0");
        require(balanceOf(_msgSender()) >= amount, "insufficient");
        _burn(_msgSender(), amount);
        surrendered[_msgSender()] += amount;
        emit Surrendered(_msgSender(), amount);
    }

    function getCompliance(address account)
        external
        view
        returns (uint32 p, uint256 balance, uint256 surrenderedAmt)
    {
        return (period, balanceOf(account), surrendered[account]);
    }

    function endPeriod() external onlyRole(REGULATOR_ROLE) {
        require(!isEnded, "already ended");
        isEnded = true;
        emit PeriodEnded(period);
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
