const hre = require("hardhat")
const fs = require("fs")
const path = require("path")

async function main() {
    const [deployer] = await hre.ethers.getSigners()

    // Load regulator addresses from centralized config
    const usersConfigPath = path.join(__dirname, "..", "..", "config", "users.json")
    const usersConfig = JSON.parse(fs.readFileSync(usersConfigPath, "utf8"))
    const REGULATORS = usersConfig.regulators.map(r => r.walletAddress)

    const INITIAL_PERIOD = parseInt(process.env.INITIAL_PERIOD || "1", 10)

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
    const REGULATOR_ROLE = await factory.REGULATOR_ROLE()

    // Grant roles to all regulators
    for (const USER_ADDRESS of REGULATORS) {
        console.log("Granting REGULATOR_ROLE to:", USER_ADDRESS)

        // 1. Grant Role on Factory (to allow openPeriod)
        let tx = await factory.grantRole(REGULATOR_ROLE, USER_ADDRESS)
        await tx.wait()
        console.log(`[Factory] Granting REGULATOR_ROLE to ${USER_ADDRESS}...`)
        console.log("Granted!")

        // 2. Grant Role on Token (to allow allocate/batchAllocate)
        const tokenAddress = await factory.tokenByPeriod(INITIAL_PERIOD)
        if (tokenAddress !== hre.ethers.ZeroAddress) {
            const PTBAEAllowanceToken = await hre.ethers.getContractFactory("PTBAEAllowanceToken")
            const token = PTBAEAllowanceToken.attach(tokenAddress)

            console.log(`[Token] Granting REGULATOR_ROLE to ${USER_ADDRESS}...`)
            tx = await token.grantRole(REGULATOR_ROLE, USER_ADDRESS)
            await tx.wait()
            console.log("Granted!")
        } else {
            console.log("No token found for initial period.")
        }

        // 3. Grant Role on SPEGRKToken (to allow issueSPE)
        const speAddress = deployments.SPEGRKToken?.address
        if (speAddress) {
            const SPEGRKToken = await hre.ethers.getContractFactory("SPEGRKToken")
            const speToken = SPEGRKToken.attach(speAddress)

            const speRegulatorRole = await speToken.REGULATOR_ROLE()
            console.log(`[SPEGRKToken] Granting REGULATOR_ROLE to ${USER_ADDRESS}...`)
            tx = await speToken.grantRole(speRegulatorRole, USER_ADDRESS)
            await tx.wait()
            console.log("Granted!")
        } else {
            console.log("SPEGRKToken address not found in deployments.")
        }
    }

    console.log("All regulators granted roles successfully!")
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
