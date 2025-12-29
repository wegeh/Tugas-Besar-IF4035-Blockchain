// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./MRVOracle.sol";

contract SPEGRKToken is ERC1155, AccessControl, ERC2771Context {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    enum Status { ACTIVE, RETIRED }

    struct UnitMeta {
        string projectId;
        uint16 vintageYear;
        string methodology;
        string registryRef;
    }

    mapping(uint256 => UnitMeta) public unitMeta;
    mapping(uint256 => Status) public status;
    mapping(uint256 => bytes32) public docHash;
    mapping(uint256 => uint64)  public issuedAt;
    mapping(uint256 => uint64)  public retiredAt;

    // supply tracking per tokenId (penting utk batch retirement)
    mapping(uint256 => uint256) public totalSupply;

    // External Oracle reference
    MRVOracle public oracle;
    
    // Prevent double spending of attestations
    mapping(bytes32 => bool) public usedAttestations;

    event SPEIssued(uint256 indexed tokenId, address indexed to, uint256 amount, bytes32 attestationId);
    event SPERetired(uint256 indexed tokenId, address indexed holder, uint256 amount);

    // Custom Errors (gas efficient + better UX)
    error InvalidRecipient();
    error InvalidAmount();
    error TokenAlreadyIssued(uint256 tokenId);
    error InvalidAttestation(bytes32 attestationId);
    error AttestationAlreadyUsed(bytes32 attestationId);
    error MetadataMismatch(bytes32 expected, bytes32 actual);
    error AlreadyRetired(uint256 tokenId);
    error InsufficientBalance(uint256 available, uint256 required);

    constructor(string memory uri_, address admin, address regulator, address oracleAddress, address trustedForwarder) 
        ERC1155(uri_) 
        ERC2771Context(trustedForwarder)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
        oracle = MRVOracle(oracleAddress);
    }

    function issueSPE(
        uint256 tokenId,
        address to,
        uint256 amount,
        UnitMeta calldata meta,
        bytes32 attestationId
    ) external onlyRole(REGULATOR_ROLE) {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();

        // tokenId = batch => only once issuance
        if (issuedAt[tokenId] != 0) revert TokenAlreadyIssued(tokenId);

        // Check attestation from external Oracle
        (bytes32 aDocHash, bytes32 aMetaHash, bool valid, ) = oracle.getAttestation(attestationId);
        if (!valid) revert InvalidAttestation(attestationId);
        if (usedAttestations[attestationId]) revert AttestationAlreadyUsed(attestationId);

        // bind meta to attestation
        bytes32 computedMetaHash = keccak256(
            abi.encode(meta.projectId, meta.vintageYear, meta.methodology, meta.registryRef)
        );
        if (computedMetaHash != aMetaHash) revert MetadataMismatch(aMetaHash, computedMetaHash);

        // commit data
        unitMeta[tokenId] = meta;
        docHash[tokenId] = aDocHash;
        status[tokenId] = Status.ACTIVE;
        issuedAt[tokenId] = uint64(block.timestamp);

        // mark attestation used locally
        usedAttestations[attestationId] = true;

        _mint(to, tokenId, amount, "");
        totalSupply[tokenId] += amount;

        emit SPEIssued(tokenId, to, amount, attestationId);
    }

    function retireSPE(uint256 tokenId, uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        if (status[tokenId] != Status.ACTIVE) revert AlreadyRetired(tokenId);
        uint256 bal = balanceOf(_msgSender(), tokenId);
        if (bal < amount) revert InsufficientBalance(bal, amount);

        _burn(_msgSender(), tokenId, amount);
        totalSupply[tokenId] -= amount;

        emit SPERetired(tokenId, _msgSender(), amount);

        // batch considered retired only when supply reaches 0
        if (totalSupply[tokenId] == 0) {
            status[tokenId] = Status.RETIRED;
            retiredAt[tokenId] = uint64(block.timestamp);
        }
    }

    function getUnit(uint256 tokenId)
        external
        view
        returns (
            UnitMeta memory meta,
            Status st,
            bytes32 mrvDocHash,
            uint64 issued,
            uint64 retired,
            uint256 supply
        )
    {
        meta = unitMeta[tokenId];
        st = status[tokenId];
        mrvDocHash = docHash[tokenId];
        issued = issuedAt[tokenId];
        retired = retiredAt[tokenId];
        supply = totalSupply[tokenId];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
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
