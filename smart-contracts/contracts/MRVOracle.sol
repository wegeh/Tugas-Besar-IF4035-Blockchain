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
}
