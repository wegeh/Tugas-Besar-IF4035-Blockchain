const hre = require("hardhat")
const fs = require("fs")
const path = require("path")

async function main() {
    const [deployer] = await hre.ethers.getSigners()

    // Address user yang ingin dijadikan Regulator (sesuai seed.ts / wallet user)
    const USER_ADDRESS = "0x2B75471E69E1A38a7bD89800400E8a6A05e4C8Cf";
    const INITIAL_PERIOD = parseInt(process.env.INITIAL_PERIOD || "1", 10)

    console.log("Granting REGULATOR_ROLE to:", USER_ADDRESS)

    // Load factory address from deployments
    const deploymentsPath = path.join(__dirname, "..", "deployments", "localhost.json")
    if (!fs.existsSync(deploymentsPath)) {
        throw new Error("Deployments file not found. Run deploy script first.")
    }
    const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
    const factoryAddress = deployments.PTBAEFactory.address

    // Connect to Factory
    const PTBAEFactory = await hre.ethers.getContractFactory("PTBAEFactory")
    const factory = PTBAEFactory.attach(factoryAddress)

    // 1. Grant Role on Factory (to allow openPeriod)
    const REGULATOR_ROLE = await factory.REGULATOR_ROLE()
    let tx = await factory.grantRole(REGULATOR_ROLE, USER_ADDRESS)
    await tx.wait()
    console.log(`Granted REGULATOR_ROLE on Factory to ${USER_ADDRESS}`)

    // 2. Grant Role on Token (to allow allocate/batchAllocate)
    const tokenAddress = await factory.tokenByPeriod(INITIAL_PERIOD)
    if (tokenAddress !== hre.ethers.ZeroAddress) {
        const PTBAEAllowanceToken = await hre.ethers.getContractFactory("PTBAEAllowanceToken")
        const token = PTBAEAllowanceToken.attach(tokenAddress)

        tx = await token.grantRole(REGULATOR_ROLE, USER_ADDRESS)
        await tx.wait()
        console.log(`Granted REGULATOR_ROLE on Token (Period ${INITIAL_PERIOD}) to ${USER_ADDRESS}`)
    } else {
        console.log("No token found for initial period.")
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
