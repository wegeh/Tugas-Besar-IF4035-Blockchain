// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract MRVOracle is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct Attestation {
        bytes32 docHash;     // hash dokumen MRV (off-chain)
        bytes32 metaHash;    // hash meta untuk mengikat metadata
        bool valid;
        uint64 attestedAt;
    }

    mapping(bytes32 => Attestation) public attestations;

    event MRVAttested(bytes32 indexed attestationId, bytes32 docHash, bytes32 metaHash, address operator);

    constructor(address admin, address operator) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    // Oracle menulis attestation. attestationId bisa dibuat dari docHash + metaHash + nonce
    function attestMRV(bytes32 attestationId, bytes32 mrvDocHash, bytes32 metaHash)
        external
        onlyRole(OPERATOR_ROLE)
    {
        Attestation storage a = attestations[attestationId];
        require(!a.valid, "attestation exists");

        attestations[attestationId] = Attestation({
            docHash: mrvDocHash,
            metaHash: metaHash,
            valid: true,
            attestedAt: uint64(block.timestamp)
        });

        emit MRVAttested(attestationId, mrvDocHash, metaHash, msg.sender);
    }

    function getAttestation(bytes32 attestationId)
        external
        view
        returns (
            bytes32 docHash,
            bytes32 metaHash,
            bool valid,
            uint64 attestedAt
        )
    {
        Attestation memory a = attestations[attestationId];
        return (a.docHash, a.metaHash, a.valid, a.attestedAt);
    }

    // ===================== VERIFIED EMISSIONS =====================
    
    // Emisi terverifikasi per period per user (ton CO2)
    mapping(uint32 => mapping(address => uint256)) public verifiedEmissions;
    // IPFS hash untuk dokumen pendukung (siap untuk integrasi IPFS)
    mapping(uint32 => mapping(address => string)) public emissionDocumentIPFS;
    mapping(uint32 => mapping(address => string)) public verificationReportIPFS;
    
    event EmissionVerified(uint32 indexed period, address indexed user, uint256 tonCO2, bytes32 attestationId);

    /**
     * @notice Set verified emission untuk user di period tertentu
     * @param period Tahun periode kepatuhan
     * @param user Alamat wallet perusahaan
     * @param tonCO2 Jumlah emisi terverifikasi dalam ton CO2
     * @param attestationId ID attestation MRV yang mendukung data ini
     */
    function setVerifiedEmission(
        uint32 period,
        address user,
        uint256 tonCO2,
        bytes32 attestationId
    ) external onlyRole(OPERATOR_ROLE) {
        require(attestations[attestationId].valid, "attestation invalid");
        require(user != address(0), "user=0");
        
        verifiedEmissions[period][user] = tonCO2;
        emit EmissionVerified(period, user, tonCO2, attestationId);
    }

    /**
     * @notice Set verified emission dengan IPFS hashes untuk audit trail
     * @dev Extended version dengan IPFS support
     */
    function setVerifiedEmissionWithIPFS(
        uint32 period,
        address user,
        uint256 tonCO2,
        bytes32 attestationId,
        string calldata docIPFS,
        string calldata reportIPFS
    ) external onlyRole(OPERATOR_ROLE) {
        require(attestations[attestationId].valid, "attestation invalid");
        require(user != address(0), "user=0");
        
        verifiedEmissions[period][user] = tonCO2;
        emissionDocumentIPFS[period][user] = docIPFS;
        verificationReportIPFS[period][user] = reportIPFS;
        
        emit EmissionVerified(period, user, tonCO2, attestationId);
    }

    /**
     * @notice Get verified emission untuk user di period tertentu
     */
    function getVerifiedEmission(uint32 period, address user) external view returns (uint256) {
        return verifiedEmissions[period][user];
    }

    /**
     * @notice Get IPFS hashes untuk audit trail
     */
    function getEmissionDocuments(uint32 period, address user) 
        external view returns (string memory docIPFS, string memory reportIPFS) 
    {
        return (emissionDocumentIPFS[period][user], verificationReportIPFS[period][user]);
    }
}
