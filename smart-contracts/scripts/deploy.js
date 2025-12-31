const fs = require("fs")
const path = require("path")
const hre = require("hardhat")

async function main() {
  const [deployer] = await hre.ethers.getSigners()

  const SPE_URI = process.env.SPE_URI || "https://example.com/metadata/{id}.json"
  const INITIAL_PERIOD = parseInt(process.env.INITIAL_PERIOD || "1", 10)
  const INITIAL_SPE_AMOUNT = parseInt(process.env.INITIAL_SPE_AMOUNT || "100", 10)
  const INITIAL_PTBAE_AMOUNT = parseInt(process.env.INITIAL_PTBAE_AMOUNT || "1000", 10)

  console.log("Deploying with:", deployer.address)

  // ===== Deploy Forwarder (ERC-2771) =====
  const Forwarder = await hre.ethers.getContractFactory("Forwarder")
  const forwarder = await Forwarder.deploy()
  await forwarder.waitForDeployment()
  const forwarderAddr = await forwarder.getAddress()
  console.log("Forwarder deployed:", forwarderAddr)

  // ===== Deploy MRVOracle =====
  const MRVOracle = await hre.ethers.getContractFactory("MRVOracle")
  const oracle = await MRVOracle.deploy(deployer.address, deployer.address)
  await oracle.waitForDeployment()
  const oracleAddr = await oracle.getAddress()
  console.log("MRVOracle deployed:", oracleAddr)

  // ===== Deploy SPEGRKToken =====
  const SPE = await hre.ethers.getContractFactory("SPEGRKToken")
  // Pass oracle and forwarder address to constructor
  const spe = await SPE.deploy(SPE_URI, deployer.address, deployer.address, oracleAddr, forwarderAddr)
  await spe.waitForDeployment()
  const speAddr = await spe.getAddress()
  console.log("SPEGRKToken deployed:", speAddr)

  // Grant OPERATOR_ROLE on Oracle to deployer
  // const OPERATOR_ROLE = await oracle.OPERATOR_ROLE()
  // Already granted in constructor to deployer, but good to know.

  // Demo attestation + issuance for tokenId 1
  const tokenId = 1
  const meta = {
    projectId: "PRJ-LOCAL-001",
    vintageYear: 2024,
    methodology: "VCS-000",
    registryRef: "REG-001",
  }
  const metaHash = hre.ethers.keccak256(
    hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint16", "string", "string"],
      [meta.projectId, meta.vintageYear, meta.methodology, meta.registryRef]
    )
  )
  const docHash = hre.ethers.id("demo-mrv-doc")
  const attestationId = hre.ethers.id("demo-attestation-1")

  // Call attestMRV on the Oracle contract
  await (await oracle.attestMRV(attestationId, docHash, metaHash)).wait()

  // Issue on SPE contract (it calls oracle to verify)
  await (await spe.issueSPE(tokenId, deployer.address, INITIAL_SPE_AMOUNT, meta, attestationId)).wait()
  console.log(`Issued SPE tokenId ${tokenId} amount ${INITIAL_SPE_AMOUNT} to ${deployer.address}`)

  // ===== Deploy PTBAEFactory =====
  // This factory will automatically deploy the initial PTBAEAllowanceToken for INITIAL_PERIOD
  const PTBAEFactory = await hre.ethers.getContractFactory("PTBAEFactory")
  // Pass forwarder and oracle address to factory
  const factory = await PTBAEFactory.deploy(
    deployer.address,  // admin
    deployer.address,  // regulator
    INITIAL_PERIOD,
    forwarderAddr,
    oracleAddr,        // MRV Oracle
    speAddr            // SPE Address
  )
  await factory.waitForDeployment()
  const factoryAddr = await factory.getAddress()
  console.log("PTBAEFactory deployed:", factoryAddr)

  // Get the token address for the initial period
  const ptbaeAddr = await factory.tokenByPeriod(INITIAL_PERIOD)
  console.log(`Initial PTBAEAllowanceToken for period ${INITIAL_PERIOD} at:`, ptbaeAddr)

  // As the regulator is the admin/regulator of the token, we can interact with it directly
  const PTBAEAllowanceToken = await hre.ethers.getContractFactory("PTBAEAllowanceToken")
  const ptbae = PTBAEAllowanceToken.attach(ptbaeAddr)

  // Allocate initial allowance to deployer
  console.log("Allocating initial allowance...")
  await (await ptbae.allocate(deployer.address, INITIAL_PTBAE_AMOUNT)).wait()
  console.log(`Allocated PTBAE amount ${INITIAL_PTBAE_AMOUNT} to ${deployer.address} for period ${INITIAL_PERIOD}`)

  // ===== Deploy EmissionSubmission =====
  const EmissionSubmission = await hre.ethers.getContractFactory("EmissionSubmission")
  const submission = await EmissionSubmission.deploy(
    deployer.address,   // admin
    deployer.address,   // regulator (for demo, Oracle role)
    forwarderAddr       // trusted forwarder
  )
  await submission.waitForDeployment()
  const submissionAddr = await submission.getAddress()
  console.log("EmissionSubmission deployed:", submissionAddr)

  // ===== Deploy GreenProjectRegistry (New, Phase-Independent) =====
  const GreenProjectRegistry = await hre.ethers.getContractFactory("GreenProjectRegistry")
  const registry = await GreenProjectRegistry.deploy(
    deployer.address,   // admin
    deployer.address,   // regulator
    forwarderAddr       // trusted forwarder
  )
  await registry.waitForDeployment()
  const registryAddr = await registry.getAddress()
  console.log("GreenProjectRegistry deployed:", registryAddr)

  // ===== Deploy IDRStable (Dummy IDRC Token) =====
  const IDRStable = await hre.ethers.getContractFactory("IDRStable")
  const idrc = await IDRStable.deploy(
    deployer.address,   // admin
    forwarderAddr       // trusted forwarder
  )
  await idrc.waitForDeployment()
  const idrcAddr = await idrc.getAddress()
  console.log("IDRStable (IDRC) deployed:", idrcAddr)

  // ===== Deploy CarbonExchange =====
  const CarbonExchange = await hre.ethers.getContractFactory("CarbonExchange")
  const exchange = await CarbonExchange.deploy(
    deployer.address,   // admin
    forwarderAddr,      // trusted forwarder
    idrcAddr,           // IDRC token
    speAddr             // SPE token
  )
  await exchange.waitForDeployment()
  const exchangeAddr = await exchange.getAddress()
  console.log("CarbonExchange deployed:", exchangeAddr)

  // Grant MATCHER_ROLE to deployer (for matching engine)
  const MATCHER_ROLE = await exchange.MATCHER_ROLE()
  await (await exchange.grantRole(MATCHER_ROLE, deployer.address)).wait()
  console.log("Granted MATCHER_ROLE to deployer")

  // Also grant MATCHER_ROLE to Hardhat Account #0 (used by default scheduler)
  const HARDHAT_ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  if (deployer.address.toLowerCase() !== HARDHAT_ACCOUNT_0.toLowerCase()) {
    await (await exchange.grantRole(MATCHER_ROLE, HARDHAT_ACCOUNT_0)).wait()
    console.log("Granted MATCHER_ROLE to Hardhat Account #0 (scheduler)")

    // Fund Hardhat Account #0 with ETH for gas (scheduler needs gas to call settleBatch)
    const gasAmount = hre.ethers.parseEther("10") // 10 ETH for gas
    await (await deployer.sendTransaction({ to: HARDHAT_ACCOUNT_0, value: gasAmount })).wait()
    console.log("Funded Hardhat Account #0 with 10 ETH for gas")
  }

  // ===== Seed IDRC for demo accounts =====
  // Load company addresses from centralized config
  const usersConfigPath = path.join(__dirname, "..", "..", "config", "users.json")
  const usersConfig = JSON.parse(fs.readFileSync(usersConfigPath, "utf8"))
  const companyAddresses = usersConfig.companies.map(c => c.walletAddress)

  const seedAmount = hre.ethers.parseUnits("10000000", 18) // 10M IDRC
  const maxApproval = hre.ethers.MaxUint256

  for (const addr of companyAddresses) {
    try {
      // Mint IDRC to demo account
      await (await idrc.mint(addr, seedAmount)).wait()
      console.log(`Minted 1M IDRC to ${addr.slice(0, 10)}...`)
    } catch (e) {
      console.log(`Skipping seed for ${addr.slice(0, 10)}... (may not exist)`)
    }
  }

  // Also mint to deployer for testing
  await (await idrc.mint(deployer.address, seedAmount)).wait()
  console.log(`Minted 1M IDRC to deployer ${deployer.address.slice(0, 10)}...`)

  // ===== Save deployments =====
  const deployments = {
    network: hre.network.name,
    rpc: hre.network.config.url || "",
    Forwarder: { address: forwarderAddr },
    MRVOracle: { address: oracleAddr },
    SPEGRKToken: { address: speAddr, tokenId, initialHolder: deployer.address },
    PTBAEFactory: { address: factoryAddr, initialPeriod: INITIAL_PERIOD },
    PTBAEAllowanceToken: { address: ptbaeAddr, period: INITIAL_PERIOD, initialHolder: deployer.address },
    EmissionSubmission: { address: submissionAddr },
    GreenProjectRegistry: { address: registryAddr },
    IDRStable: { address: idrcAddr },
    CarbonExchange: { address: exchangeAddr },
  }

  const outDir = path.join(__dirname, "..", "deployments")
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `${hre.network.name}.json`)
  fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2))
  console.log(`Saved deployments to ${outFile}`)

  // Copy ABIs to frontend/abi and addresses.local.json
  const frontendAbiDir = path.join(__dirname, "..", "..", "frontend", "abi")
  if (fs.existsSync(frontendAbiDir)) {
    const speArtifact = path.join(__dirname, "..", "artifacts", "contracts", "SPEGRKToken.sol", "SPEGRKToken.json")
    const ptbaeArtifact = path.join(__dirname, "..", "artifacts", "contracts", "PTBAEAllowanceToken.sol", "PTBAEAllowanceToken.json")
    const factoryArtifact = path.join(__dirname, "..", "artifacts", "contracts", "PTBAEFactory.sol", "PTBAEFactory.json")
    const forwarderArtifact = path.join(__dirname, "..", "artifacts", "contracts", "Forwarder.sol", "Forwarder.json")
    const oracleArtifact = path.join(__dirname, "..", "artifacts", "contracts", "MRVOracle.sol", "MRVOracle.json")
    const submissionArtifact = path.join(__dirname, "..", "artifacts", "contracts", "EmissionSubmission.sol", "EmissionSubmission.json")

    fs.copyFileSync(speArtifact, path.join(frontendAbiDir, "SPEGRKToken.json"))
    fs.copyFileSync(ptbaeArtifact, path.join(frontendAbiDir, "PTBAEAllowanceToken.json"))
    fs.copyFileSync(factoryArtifact, path.join(frontendAbiDir, "PTBAEFactory.json"))
    fs.copyFileSync(forwarderArtifact, path.join(frontendAbiDir, "Forwarder.json"))
    fs.copyFileSync(oracleArtifact, path.join(frontendAbiDir, "MRVOracle.json"))
    fs.copyFileSync(oracleArtifact, path.join(frontendAbiDir, "MRVOracle.json"))
    fs.copyFileSync(submissionArtifact, path.join(frontendAbiDir, "EmissionSubmission.json"))

    const registryArtifact = path.join(__dirname, "..", "artifacts", "contracts", "GreenProjectRegistry.sol", "GreenProjectRegistry.json")
    fs.copyFileSync(registryArtifact, path.join(frontendAbiDir, "GreenProjectRegistry.json"))

    const idrcArtifact = path.join(__dirname, "..", "artifacts", "contracts", "IDRStable.sol", "IDRStable.json")
    fs.copyFileSync(idrcArtifact, path.join(frontendAbiDir, "IDRStable.json"))

    const exchangeArtifact = path.join(__dirname, "..", "artifacts", "contracts", "CarbonExchange.sol", "CarbonExchange.json")
    fs.copyFileSync(exchangeArtifact, path.join(frontendAbiDir, "CarbonExchange.json"))

    fs.writeFileSync(path.join(frontendAbiDir, "addresses.local.json"), JSON.stringify(deployments, null, 2))
    console.log("Copied ABIs (including IDRStable, CarbonExchange) and addresses.local.json into frontend/abi")
  } else {
    console.log("frontend/abi not found; skipped copying ABIs")
  }

  console.log("\nNEXT_PUBLIC_RPC_URL=", hre.network.config.url || "http://127.0.0.1:8545")
  console.log("NEXT_PUBLIC_SPE_ADDRESS=", speAddr)
  console.log("NEXT_PUBLIC_PTBAE_FACTORY_ADDRESS=", factoryAddr)
  console.log("NEXT_PUBLIC_PTBAE_ADDRESS=", ptbaeAddr)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
