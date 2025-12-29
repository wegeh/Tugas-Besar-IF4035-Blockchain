const hre = require("hardhat");

async function main() {
    const provider = hre.ethers.provider;
    const network = await provider.getNetwork();
    console.log("Current Chain ID:", network.chainId.toString());
}

main().catch(console.error);
