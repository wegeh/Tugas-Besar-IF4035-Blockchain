const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Oracle Separation Verification", function () {
    let MRVOracle, oracle;
    let SPE, spe;
    let admin, regulator, operator, other;

    before(async function () {
        [admin, regulator, operator, other] = await ethers.getSigners();
        MRVOracle = await ethers.getContractFactory("MRVOracle");
        SPE = await ethers.getContractFactory("SPEGRKToken");
    });

    beforeEach(async function () {
        // 1. Deploy Oracle
        oracle = await MRVOracle.deploy(admin.address, operator.address);
        await oracle.waitForDeployment();
        const oracleAddr = await oracle.getAddress();

        // 2. Deploy SPE Token, connecting it to Oracle
        spe = await SPE.deploy("https://meta.com/{id}.json", admin.address, regulator.address, oracleAddr);
        await spe.waitForDeployment();
    });

    it("Should allow operator to attest MRV on Oracle", async function () {
        const attestationId = ethers.id("attest-1");
        const docHash = ethers.id("doc-1");
        const metaHash = ethers.id("meta-1");

        await expect(oracle.connect(operator).attestMRV(attestationId, docHash, metaHash))
            .to.emit(oracle, "MRVAttested")
            .withArgs(attestationId, docHash, metaHash, operator.address);

        const attestation = await oracle.getAttestation(attestationId);
        expect(attestation.valid).to.be.true;
        expect(attestation.docHash).to.equal(docHash);
    });

    it("Should allow regulator to issue SPE using valid attestation", async function () {
        const tokenId = 1;
        const amount = 100;
        const attestationId = ethers.id("attest-2");

        // Create valid metadata structure
        const meta = {
            projectId: "PRJ-1",
            vintageYear: 2024,
            methodology: "METH-1",
            registryRef: "REG-1"
        };

        // Calculate hash as expected by contract
        const metaHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["string", "uint16", "string", "string"],
                [meta.projectId, meta.vintageYear, meta.methodology, meta.registryRef]
            )
        );
        const docHash = ethers.id("doc-2");

        // 1. Operator attests
        await oracle.connect(operator).attestMRV(attestationId, docHash, metaHash);

        // 2. Regulator issues
        await expect(spe.connect(regulator).issueSPE(tokenId, other.address, amount, meta, attestationId))
            .to.emit(spe, "SPEIssued");

        expect(await spe.balanceOf(other.address, tokenId)).to.equal(amount);
    });

    it("Should fail issuance if attestation is missing or invalid", async function () {
        const tokenId = 2;
        const meta = { projectId: "", vintageYear: 0, methodology: "", registryRef: "" };
        const attestationId = ethers.id("invalid");

        await expect(spe.connect(regulator).issueSPE(tokenId, other.address, 100, meta, attestationId))
            .to.be.revertedWith("invalid attestation");
    });

    it("Should fail issuance if used twice", async function () {
        // Setup valid attestation
        const attestationId = ethers.id("attest-3");
        const meta = { projectId: "X", vintageYear: 2024, methodology: "Y", registryRef: "Z" };
        const metaHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["string", "uint16", "string", "string"],
                [meta.projectId, meta.vintageYear, meta.methodology, meta.registryRef]
            )
        );
        await oracle.connect(operator).attestMRV(attestationId, ethers.id("d"), metaHash);

        // First issue (Success)
        await spe.connect(regulator).issueSPE(10, other.address, 50, meta, attestationId);

        // Second issue with same attestation (Fail)
        await expect(spe.connect(regulator).issueSPE(11, other.address, 50, meta, attestationId))
            .to.be.revertedWith("attestation used");
    });
});
