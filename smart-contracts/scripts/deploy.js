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

  // ===== Deploy SPEGRKToken =====
  const SPE = await hre.ethers.getContractFactory("SPEGRKToken")
  const spe = await SPE.deploy(SPE_URI, deployer.address, deployer.address)
  await spe.waitForDeployment()
  const speAddr = await spe.getAddress()
  console.log("SPEGRKToken deployed:", speAddr)

  // Grant ORACLE_ROLE to deployer for testing attestation/issuance
  const ORACLE_ROLE = hre.ethers.id("ORACLE_ROLE")
  await (await spe.grantRole(ORACLE_ROLE, deployer.address)).wait()

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
  await (await spe.attestMRV(attestationId, docHash, metaHash)).wait()
  await (await spe.issueSPE(tokenId, deployer.address, INITIAL_SPE_AMOUNT, meta, attestationId)).wait()
  console.log(`Issued SPE tokenId ${tokenId} amount ${INITIAL_SPE_AMOUNT} to ${deployer.address}`)

  // ===== Deploy PTBAEAllowanceToken =====
  const PTBAEAllowanceToken = await hre.ethers.getContractFactory("PTBAEAllowanceToken")
  const ptbae = await PTBAEAllowanceToken.deploy(deployer.address, deployer.address, INITIAL_PERIOD)
  await ptbae.waitForDeployment()
  const ptbaeAddr = await ptbae.getAddress()
  console.log("PTBAEAllowanceToken deployed:", ptbaeAddr)

  // Allocate initial allowance to deployer
  await (await ptbae.allocate(deployer.address, INITIAL_PTBAE_AMOUNT)).wait()
  console.log(`Allocated PTBAE amount ${INITIAL_PTBAE_AMOUNT} to ${deployer.address} for period ${INITIAL_PERIOD}`)

  // ===== Save deployments =====
  const deployments = {
    network: hre.network.name,
    rpc: hre.network.config.url || "",
    SPEGRKToken: { address: speAddr, tokenId, initialHolder: deployer.address },
    PTBAEAllowanceToken: { address: ptbaeAddr, period: INITIAL_PERIOD, initialHolder: deployer.address },
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
    const ptbaeArtifact = path.join(
      __dirname,
      "..",
      "artifacts",
      "contracts",
      "PTBAEAllowanceToken.sol",
      "PTBAEAllowanceToken.json"
    )
    fs.copyFileSync(speArtifact, path.join(frontendAbiDir, "SPEGRKToken.json"))
    fs.copyFileSync(ptbaeArtifact, path.join(frontendAbiDir, "PTBAEAllowanceToken.json"))
    fs.writeFileSync(path.join(frontendAbiDir, "addresses.local.json"), JSON.stringify(deployments, null, 2))
    console.log("Copied ABIs and addresses.local.json into frontend/abi")
  } else {
    console.log("frontend/abi not found; skipped copying ABIs")
  }

  console.log("\nNEXT_PUBLIC_RPC_URL=", hre.network.config.url || "http://127.0.0.1:8545")
  console.log("NEXT_PUBLIC_SPE_ADDRESS=", speAddr)
  console.log("NEXT_PUBLIC_PTBAE_ADDRESS=", ptbaeAddr)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
