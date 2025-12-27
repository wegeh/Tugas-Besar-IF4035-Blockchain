// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract PTBAEAllowanceToken is ERC20, AccessControl {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    uint32 public immutable period;

    mapping(address => uint256) public surrendered;

    event Allocated(address indexed to, uint256 amount);
    event Surrendered(address indexed from, uint256 amount);

    constructor(address admin, address regulator, uint32 _period)
        ERC20("PTBAE-PU Allowance", "PTBAE")
    {
        period = _period;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
    }

    function allocate(address to, uint256 amount) external onlyRole(REGULATOR_ROLE) {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        _mint(to, amount);
        emit Allocated(to, amount);
    }

    function batchAllocate(address[] calldata recipients, uint256 amount) external onlyRole(REGULATOR_ROLE) {
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
        require(balanceOf(msg.sender) >= amount, "insufficient");
        _burn(msg.sender, amount);
        surrendered[msg.sender] += amount;
        emit Surrendered(msg.sender, amount);
    }

    function getCompliance(address account)
        external
        view
        returns (uint32 p, uint256 balance, uint256 surrenderedAmt)
    {
        return (period, balanceOf(account), surrendered[account]);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
