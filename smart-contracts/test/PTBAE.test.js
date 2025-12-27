const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PTBAEFactory Fix Verification", function () {
    let Factory, factory;
    let Token, token;
    let owner, regulator, company, other;

    before(async function () {
        [owner, regulator, company, other] = await ethers.getSigners();
        Factory = await ethers.getContractFactory("PTBAEFactory");
        // Token factory is needed to attach to the address returned by Factory
        Token = await ethers.getContractFactory("PTBAEAllowanceToken");
    });

    it("Should allow regulator to allocate on initial period token", async function () {
        // Deploy factory with initial period 1
        // Pass 'regulator' address as the 2nd argument (the regulator)
        factory = await Factory.deploy(owner.address, regulator.address, 1);
        await factory.waitForDeployment();

        const tokenAddress = await factory.tokenByPeriod(1);
        expect(tokenAddress).to.not.equal(ethers.ZeroAddress);

        // Attach to the token contract
        token = Token.attach(tokenAddress);

        // Verify regulator has role
        const REGULATOR_ROLE = await token.REGULATOR_ROLE();
        expect(await token.hasRole(REGULATOR_ROLE, regulator.address)).to.be.true;

        // Regulator calls allocate
        await expect(token.connect(regulator).allocate(company.address, 1000))
            .to.emit(token, "Allocated")
            .withArgs(company.address, 1000);

        expect(await token.balanceOf(company.address)).to.equal(1000);
    });

    it("Should allow regulator to open new period and allocate", async function () {
        // Regulator opens period 2
        await expect(factory.connect(regulator).openPeriod(2))
            .to.emit(factory, "PeriodOpened");

        const tokenAddress2 = await factory.tokenByPeriod(2);
        const token2 = Token.attach(tokenAddress2);

        // Regulator calls allocate on new token
        await expect(token2.connect(regulator).allocate(company.address, 500))
            .to.emit(token2, "Allocated")
            .withArgs(company.address, 500);

        expect(await token2.balanceOf(company.address)).to.equal(500);
    });

    it("Should fail if non-regulator tries to allocate", async function () {
        const tokenAddress = await factory.tokenByPeriod(1);
        const token = Token.attach(tokenAddress);

        await expect(token.connect(other).allocate(company.address, 100))
            .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
});
