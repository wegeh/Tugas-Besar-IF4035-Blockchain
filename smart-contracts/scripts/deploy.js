const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  const network = await deployer.provider.getNetwork();
  console.log("chainId:", network.chainId.toString());

  const SPE_URI = process.env.SPE_URI || "https://example.com/metadata/{id}.json";
  const INITIAL_PERIOD = parseInt(process.env.INITIAL_PERIOD || "1", 10);

  // ===== Deploy SPEGRKToken =====
  const SPE = await hre.ethers.getContractFactory("SPEGRKToken");
  const spe = await SPE.deploy(SPE_URI, deployer.address, deployer.address);
  await spe.waitForDeployment();
  const speAddr = await spe.getAddress();
  console.log("✅ SPEGRKToken deployed:", speAddr);

  // ===== Deploy PTBAEFactory =====
  const Factory = await hre.ethers.getContractFactory("PTBAEFactory");
  const factory = await Factory.deploy(deployer.address, deployer.address, INITIAL_PERIOD);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("✅ PTBAEFactory deployed:", factoryAddr);

  // ===== Resolve token address for initial period =====
  const ptbaeTokenAddr = await factory.tokenByPeriod(INITIAL_PERIOD);
  console.log(`✅ PTBAEAllowanceToken (period ${INITIAL_PERIOD}) deployed:`, ptbaeTokenAddr);

  console.log("\n📋 COPY TO FRONTEND ENV:");
  console.log("NEXT_PUBLIC_CHAIN_ID=", network.chainId.toString());
  console.log("NEXT_PUBLIC_SPE_ADDRESS=", speAddr);
  console.log("NEXT_PUBLIC_PTBAE_FACTORY=", factoryAddr);
  console.log("NEXT_PUBLIC_PTBAE_TOKEN=", ptbaeTokenAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
