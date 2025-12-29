// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title GreenProjectRegistry
 * @notice Registry for Green Projects (SPE-GRK) that is PHASE-INDEPENDENT.
 * @dev Projects can be submitted at ANY time. No period binding.
 */
contract GreenProjectRegistry is AccessControl, ERC2771Context {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    enum ProjectStatus { PENDING, VERIFIED, REJECTED }

    struct ProjectSubmission {
        string ipfsHash;           // "SPE|ProjectId|Vintage|..."
        uint256 submittedAt;
        ProjectStatus status;
        uint256 verifiedAmount;    // Potential credits
    }

    // Mapping: User Address -> Submission Index -> Submission
    // One user can submit multiple projects over time
    mapping(address => ProjectSubmission[]) public userSubmissions;
    
    // Global list for regulator view (optional, or rely on events)
    // We'll keep it simple: Access by user address primarily or Graph
    
    address[] public projectSubmitters;
    mapping(address => bool) public isSubmitter;

    event ProjectSubmitted(
        address indexed user,
        uint256 indexed submissionIndex,
        string ipfsHash,
        uint256 timestamp
    );
    
    event ProjectVerified(
        address indexed user,
        uint256 indexed submissionIndex,
        uint256 verifiedAmount
    );
    
    event ProjectRejected(
        address indexed user,
        uint256 indexed submissionIndex,
        string reason
    );

    constructor(address admin, address regulator, address trustedForwarder)
        ERC2771Context(trustedForwarder)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
    }

    function submitProject(string calldata ipfsHash) external {
        require(bytes(ipfsHash).length > 0, "IPFS hash required");

        ProjectSubmission memory newSubmission = ProjectSubmission({
            ipfsHash: ipfsHash,
            submittedAt: block.timestamp,
            status: ProjectStatus.PENDING,
            verifiedAmount: 0
        });

        userSubmissions[_msgSender()].push(newSubmission);
        uint256 index = userSubmissions[_msgSender()].length - 1;

        if (!isSubmitter[_msgSender()]) {
            projectSubmitters.push(_msgSender());
            isSubmitter[_msgSender()] = true;
        }

        emit ProjectSubmitted(_msgSender(), index, ipfsHash, block.timestamp);
    }

    function getMySubmissions() external view returns (ProjectSubmission[] memory) {
        return userSubmissions[_msgSender()];
    }

    function getUserSubmissions(address user) external view returns (ProjectSubmission[] memory) {
        return userSubmissions[user];
    }

    // ORACLE FUNCTIONS

    function markVerified(address user, uint256 index, uint256 amount) 
        external 
        onlyRole(REGULATOR_ROLE) 
    {
        require(index < userSubmissions[user].length, "Index out of bounds");
        require(userSubmissions[user][index].status == ProjectStatus.PENDING, "Not pending");

        userSubmissions[user][index].status = ProjectStatus.VERIFIED;
        userSubmissions[user][index].verifiedAmount = amount;

        emit ProjectVerified(user, index, amount);
    }

    function markRejected(address user, uint256 index, string calldata reason) 
        external 
        onlyRole(REGULATOR_ROLE) 
    {
        require(index < userSubmissions[user].length, "Index out of bounds");
        require(userSubmissions[user][index].status == ProjectStatus.PENDING, "Not pending");

        userSubmissions[user][index].status = ProjectStatus.REJECTED;

        emit ProjectRejected(user, index, reason);
    }

    // ERC2771 overrides
    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
