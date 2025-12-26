const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying with:", deployer.address);
  const network = await deployer.provider.getNetwork();
  console.log("chainId:", network.chainId.toString());

  // =========================
  // Config (bisa dari .env)
  // =========================
  const SPE_URI = process.env.SPE_URI || "https://example.com/metadata/{id}.json";
  const INITIAL_PERIOD = parseInt(process.env.INITIAL_PERIOD || "1", 10);

  // =========================
  // Deploy SPEGRKToken
  // constructor(string uri_, address admin, address regulator)
  // =========================
  const SPE = await hre.ethers.getContractFactory("SPEGRKToken");
  const spe = await SPE.deploy(
    SPE_URI,
    deployer.address, // admin
    deployer.address  // regulator
  );
  await spe.deployed();
  console.log("✅ SPEGRKToken deployed:", spe.address);

  // =========================
  // Deploy PTBAEFactory
  // constructor(address admin, address regulator, uint32 initialPeriod)
  // =========================
  const Factory = await hre.ethers.getContractFactory("PTBAEFactory");
  const factory = await Factory.deploy(
    deployer.address,  // admin
    deployer.address,  // regulator
    INITIAL_PERIOD
  );
  await factory.deployed();
  console.log("PTBAEFactory deployed:", factory.address);

  // =========================
  // Resolve token address created for INITIAL_PERIOD
  // mapping(uint32 => address) public tokenByPeriod;
  // =========================
  const ptbaeTokenAddr = await factory.tokenByPeriod(INITIAL_PERIOD);
  console.log(`PTBAEAllowanceToken (period ${INITIAL_PERIOD}) deployed:`, ptbaeTokenAddr);

  console.log("\n COPY TO FRONTEND ENV:");
  console.log("NEXT_PUBLIC_CHAIN_ID=", network.chainId.toString());
  console.log("NEXT_PUBLIC_SPE_ADDRESS=", spe.address);
  console.log("NEXT_PUBLIC_PTBAE_FACTORY=", factory.address);
  console.log("NEXT_PUBLIC_PTBAE_TOKEN=", ptbaeTokenAddr);

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
