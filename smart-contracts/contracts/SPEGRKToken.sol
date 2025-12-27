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
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");

        // tokenId = batch => only once issuance
        require(issuedAt[tokenId] == 0, "tokenId already issued");

        // Check attestation from external Oracle
        (bytes32 aDocHash, bytes32 aMetaHash, bool valid, ) = oracle.getAttestation(attestationId);
        require(valid, "invalid attestation");
        require(!usedAttestations[attestationId], "attestation used");

        // bind meta to attestation
        bytes32 computedMetaHash = keccak256(
            abi.encode(meta.projectId, meta.vintageYear, meta.methodology, meta.registryRef)
        );
        require(computedMetaHash == aMetaHash, "meta mismatch");

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
        require(amount > 0, "amount=0");
        require(status[tokenId] == Status.ACTIVE, "already retired");
        require(balanceOf(_msgSender(), tokenId) >= amount, "insufficient");

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
