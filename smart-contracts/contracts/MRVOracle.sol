// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MRVOracle
 * @notice Oracle contract for MRV (Monitoring, Reporting, Verification) attestations
 * @dev Supports two models:
 *   - PTBAE: Atomic finalization (Oracle = Finalizer)
 *   - SPE: Attestation + Consumption (Oracle = Attester, Token = Consumer)
 */
contract MRVOracle is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");

    struct Attestation {
        uint256 amount;      // verified amount (tonCO2 or credits)
        bytes32 docHash;     // hash of MRV document
        bytes32 metaHash;    // hash of metadata binding
        bool valid;
        bool isUsed;         // anti-replay flag
        uint64 attestedAt;
        uint64 expiresAt;    // 0 = no expiry
    }

    mapping(bytes32 => Attestation) public attestations;

    // PTBAE Idempotency
    mapping(uint32 => mapping(address => bool)) public isFinalized;
    mapping(uint32 => mapping(address => uint256)) public verifiedEmissions;
    mapping(uint32 => mapping(address => string)) public emissionDocumentIPFS;
    mapping(uint32 => mapping(address => string)) public verificationReportIPFS;

    // Events
    event MRVAttested(bytes32 indexed attestationId, uint256 amount, bytes32 docHash, bytes32 metaHash, uint64 expiresAt, address operator);
    event AttestationConsumed(bytes32 indexed attestationId, address consumer);
    event EmissionFinalized(uint32 indexed period, address indexed user, uint256 tonCO2, bytes32 attestationId);

    constructor(address admin, address operator) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // ===================== PTBAE: Atomic Finalization =====================

    /**
     * @notice Finalize emission verification (PTBAE)
     * @dev Atomic: creates attestation + sets value + marks finalized
     */
    function finalizeEmission(
        uint32 period,
        address user,
        uint256 tonCO2,
        bytes32 docHash,
        bytes32 metaHash,
        string calldata docIPFS,
        string calldata reportIPFS
    ) external onlyRole(OPERATOR_ROLE) {
        require(!isFinalized[period][user], "Oracle: Already finalized");
        require(user != address(0), "Oracle: Invalid user");

        bytes32 attestationId = keccak256(abi.encodePacked("ptbae", period, user));

        attestations[attestationId] = Attestation({
            amount: tonCO2,
            docHash: docHash,
            metaHash: metaHash,
            valid: true,
            isUsed: true,
            attestedAt: uint64(block.timestamp),
            expiresAt: 0
        });

        verifiedEmissions[period][user] = tonCO2;
        emissionDocumentIPFS[period][user] = docIPFS;
        verificationReportIPFS[period][user] = reportIPFS;
        isFinalized[period][user] = true;

        emit EmissionFinalized(period, user, tonCO2, attestationId);
    }

    // ===================== SPE: Attestation Model =====================

    /**
     * @notice Create attestation for SPE project
     */
    function attestProject(
        bytes32 attestationId,
        uint256 approvedAmount,
        bytes32 docHash,
        bytes32 metaHash,
        uint64 expiryDuration
    ) external onlyRole(OPERATOR_ROLE) {
        require(!attestations[attestationId].valid, "Oracle: Attestation exists");

        uint64 expiresAt = (expiryDuration > 0) ? uint64(block.timestamp) + expiryDuration : 0;

        attestations[attestationId] = Attestation({
            amount: approvedAmount,
            docHash: docHash,
            metaHash: metaHash,
            valid: true,
            isUsed: false,
            attestedAt: uint64(block.timestamp),
            expiresAt: expiresAt
        });

        emit MRVAttested(attestationId, approvedAmount, docHash, metaHash, expiresAt, msg.sender);
    }

    /**
     * @notice Consume attestation (called by trusted consumer like SPE Token)
     */
    function consumeAttestation(bytes32 attestationId) external onlyRole(CONSUMER_ROLE) {
        Attestation storage a = attestations[attestationId];
        require(a.valid, "Oracle: Invalid attestation");
        require(!a.isUsed, "Oracle: Already consumed");
        if (a.expiresAt > 0) {
            require(block.timestamp <= a.expiresAt, "Oracle: Expired");
        }

        a.isUsed = true;
        emit AttestationConsumed(attestationId, msg.sender);
    }

    // ===================== Views =====================

    function getAttestation(bytes32 attestationId) external view returns (Attestation memory) {
        return attestations[attestationId];
    }

    function isValidAttestation(bytes32 attestationId) external view returns (bool) {
        Attestation memory a = attestations[attestationId];
        if (!a.valid || a.isUsed) return false;
        if (a.expiresAt > 0 && block.timestamp > a.expiresAt) return false;
        return true;
    }

    function getVerifiedEmission(uint32 period, address user) external view returns (uint256) {
        return verifiedEmissions[period][user];
    }

    function getEmissionDocuments(uint32 period, address user) external view returns (string memory, string memory) {
        return (emissionDocumentIPFS[period][user], verificationReportIPFS[period][user]);
    }
}
