// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title EmissionSubmission
 * @notice Contract untuk menyimpan submission laporan emisi dari perusahaan
 * @dev Setiap submission di-record on-chain dengan IPFS hash, Oracle akan listen events
 */
contract EmissionSubmission is AccessControl, ERC2771Context {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    enum SubmissionStatus { PENDING, VERIFIED, REJECTED }

    struct Submission {
        string ipfsHash;           // IPFS CID of emission document
        uint256 submittedAt;       // Timestamp submission
        SubmissionStatus status;   // Current status
        uint256 verifiedEmission;  // Result from Oracle (ton CO2e)
    }

    // period => user => Submission
    mapping(uint32 => mapping(address => Submission)) public submissions;
    
    // Track which users have submitted per period
    mapping(uint32 => address[]) public periodSubmitters;
    mapping(uint32 => mapping(address => bool)) public hasSubmitted;

    // Events for Oracle to listen
    event EmissionSubmitted(
        address indexed user,
        uint32 indexed period,
        string ipfsHash,
        uint256 timestamp
    );
    
    event SubmissionVerified(
        address indexed user,
        uint32 indexed period,
        uint256 verifiedEmission
    );
    
    event SubmissionRejected(
        address indexed user,
        uint32 indexed period,
        string reason
    );

    constructor(address admin, address regulator, address trustedForwarder)
        ERC2771Context(trustedForwarder)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
    }

    /**
     * @notice Submit laporan emisi dengan IPFS hash
     * @param period Tahun periode kepatuhan
     * @param ipfsHash CID dokumen di IPFS
     */
    function submitEmission(uint32 period, string calldata ipfsHash) external {
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(!hasSubmitted[period][_msgSender()], "Already submitted for this period");

        submissions[period][_msgSender()] = Submission({
            ipfsHash: ipfsHash,
            submittedAt: block.timestamp,
            status: SubmissionStatus.PENDING,
            verifiedEmission: 0
        });

        periodSubmitters[period].push(_msgSender());
        hasSubmitted[period][_msgSender()] = true;

        emit EmissionSubmitted(_msgSender(), period, ipfsHash, block.timestamp);
    }

    /**
     * @notice Get submission details
     */
    function getSubmission(uint32 period, address user)
        external
        view
        returns (
            string memory ipfsHash,
            uint256 submittedAt,
            SubmissionStatus status,
            uint256 verifiedEmission
        )
    {
        Submission memory s = submissions[period][user];
        return (s.ipfsHash, s.submittedAt, s.status, s.verifiedEmission);
    }

    /**
     * @notice Get all submitters for a period
     */
    function getSubmitters(uint32 period) external view returns (address[] memory) {
        return periodSubmitters[period];
    }

    /**
     * @notice Get pending submissions count
     */
    function getPendingCount(uint32 period) external view returns (uint256 count) {
        address[] memory submitters = periodSubmitters[period];
        for (uint256 i = 0; i < submitters.length; i++) {
            if (submissions[period][submitters[i]].status == SubmissionStatus.PENDING) {
                count++;
            }
        }
    }

    // ========== ORACLE-ONLY FUNCTIONS (called by Oracle service) ==========
    // Note: In production, these would have OPERATOR_ROLE check
    // For demo, we allow REGULATOR_ROLE to simulate Oracle

    /**
     * @notice Mark submission as verified (called by Oracle)
     */
    function markVerified(uint32 period, address user, uint256 verifiedEmission)
        external
        onlyRole(REGULATOR_ROLE)
    {
        require(hasSubmitted[period][user], "No submission found");
        require(submissions[period][user].status == SubmissionStatus.PENDING, "Not pending");

        submissions[period][user].status = SubmissionStatus.VERIFIED;
        submissions[period][user].verifiedEmission = verifiedEmission;

        emit SubmissionVerified(user, period, verifiedEmission);
    }

    /**
     * @notice Mark submission as rejected (called by Oracle)
     */
    function markRejected(uint32 period, address user, string calldata reason)
        external
        onlyRole(REGULATOR_ROLE)
    {
        require(hasSubmitted[period][user], "No submission found");
        require(submissions[period][user].status == SubmissionStatus.PENDING, "Not pending");

        submissions[period][user].status = SubmissionStatus.REJECTED;

        emit SubmissionRejected(user, period, reason);
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
