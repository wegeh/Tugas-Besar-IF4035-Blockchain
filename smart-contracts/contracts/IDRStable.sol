// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title IDRStable
 * @notice Dummy Indonesian Rupiah Stablecoin (IDRC) for demo trading
 * @dev ERC-20 token with admin minting and faucet for demo purposes
 */
contract IDRStable is ERC20, AccessControl, ERC2771Context {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // Faucet config
    uint256 public constant FAUCET_AMOUNT = 1_000_000 * 10**18; // 1 million IDRC
    uint256 public constant FAUCET_COOLDOWN = 1 days;
    mapping(address => uint256) public lastFaucetClaim;

    // Events
    event FaucetClaimed(address indexed user, uint256 amount);

    constructor(
        address admin,
        address trustedForwarder
    ) ERC20("Carbon Rupiah", "IDRC") ERC2771Context(trustedForwarder) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        
        // Mint initial supply to admin
        _mint(admin, 100_000_000 * 10**18); // 100 million IDRC
    }

    /**
     * @notice Mint IDRC tokens (admin only)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Faucet for demo - claim free IDRC
     * @dev Limited to once per day per address
     */
    function claimFaucet() external {
        address sender = _msgSender();
        require(
            block.timestamp >= lastFaucetClaim[sender] + FAUCET_COOLDOWN,
            "Faucet: cooldown not expired"
        );
        
        lastFaucetClaim[sender] = block.timestamp;
        _mint(sender, FAUCET_AMOUNT);
        
        emit FaucetClaimed(sender, FAUCET_AMOUNT);
    }

    /**
     * @notice Check when user can claim faucet again
     */
    function nextFaucetClaim(address user) external view returns (uint256) {
        uint256 lastClaim = lastFaucetClaim[user];
        if (lastClaim == 0) return 0; // Never claimed, can claim now
        return lastClaim + FAUCET_COOLDOWN;
    }

    // ERC2771 override
    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    // AccessControl override for supportsInterface
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
