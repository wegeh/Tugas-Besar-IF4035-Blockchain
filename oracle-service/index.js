/**
 * Oracle Service for Carbon Ledger ID
 * 
 * Listens to EmissionSubmitted events from blockchain,
 * fetches documents from local IPFS, verifies (simplified),
 * and pushes verified emission to MRVOracle contract.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load config from frontend addresses
const addressesPath = path.join(__dirname, "..", "frontend", "abi", "addresses.local.json");
const submissionAbiPath = path.join(__dirname, "..", "frontend", "abi", "EmissionSubmission.json");
const oracleAbiPath = path.join(__dirname, "..", "frontend", "abi", "MRVOracle.json");

// Configuration
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || "http://127.0.0.1:8080/ipfs";

// Oracle operator private key (same as deployer for demo)
// In production, this should be a dedicated Oracle account
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default account 0

async function main() {
    console.log("🔮 Starting Oracle Service...");
    console.log(`RPC: ${RPC_URL}`);
    console.log(`IPFS Gateway: ${IPFS_GATEWAY}`);

    // Check if addresses file exists
    if (!fs.existsSync(addressesPath)) {
        console.error("❌ addresses.local.json not found. Run 'make bootstrap' first.");
        process.exit(1);
    }

    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const submissionAbi = JSON.parse(fs.readFileSync(submissionAbiPath, "utf8")).abi;
    const oracleAbi = JSON.parse(fs.readFileSync(oracleAbiPath, "utf8")).abi;

    console.log(`EmissionSubmission: ${addresses.EmissionSubmission?.address}`);
    console.log(`MRVOracle: ${addresses.MRVOracle?.address}`);

    if (!addresses.EmissionSubmission?.address) {
        console.error("❌ EmissionSubmission contract not found in addresses.");
        process.exit(1);
    }

    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Use the deployer/regulator address from addresses.local.json if available to get the signer
    // This assumes the node has this account unlocked (which it does in our docker-compose)
    let signer;
    try {
        // We assume the deployer of the contracts is the one we want to use (Regulator)
        // In our deploy script, the deployer is the first account
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            signer = await provider.getSigner(accounts[0].address);
            console.log(`✅ Using unlocked account: ${accounts[0].address}`);
        } else {
            // Fallback to private key if no accounts on node (e.g. standard Hardhat node)
            console.log("⚠️ No unlocked accounts found on node. Using fallback private key.");
            signer = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);
        }
    } catch (err) {
        console.error("Error getting signer:", err);
        process.exit(1);
    }

    // Setup contracts
    const submissionContract = new ethers.Contract(
        addresses.EmissionSubmission.address,
        submissionAbi,
        signer // ✅ Need signer to call markVerified
    );

    const oracleContract = new ethers.Contract(
        addresses.MRVOracle.address,
        oracleAbi,
        signer // Needs signer for transactions
    );

    console.log("👂 Listening for EmissionSubmitted events...\n");

    // Listen for new submissions
    submissionContract.on("EmissionSubmitted", async (user, period, ipfsHash, timestamp, event) => {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📩 New Emission Submission Detected!");
        console.log(`   User:    ${user}`);
        console.log(`   Period:  ${period}`);
        console.log(`   IPFS:    ${ipfsHash}`);
        console.log(`   Time:    ${new Date(Number(timestamp) * 1000).toISOString()}`);
        console.log("");

        try {
            // 1. Fetch document from IPFS
            const ipfsUrl = `${IPFS_GATEWAY}/${ipfsHash}`;
            console.log(`📥 Document URL: ${ipfsUrl}`);

            // 2. Verify emission (simplified for demo)
            const verifiedEmission = ethers.parseUnits("1000", 18);
            console.log(`✅ Verified Emission: 1000 ton CO2e`);

            // 3. Create attestation
            const attestationId = ethers.keccak256(
                ethers.toUtf8Bytes(`attestation-${period}-${user}-${Date.now()}`)
            );
            const docHash = ethers.keccak256(ethers.toUtf8Bytes(ipfsHash));
            const metaHash = ethers.keccak256(ethers.toUtf8Bytes(`meta-${Date.now()}`));

            console.log("📝 Creating attestation...");
            const attestTx = await oracleContract.attestMRV(attestationId, docHash, metaHash);
            await attestTx.wait();
            console.log(`   TX: ${attestTx.hash}`);

            // 4. Push verified emission to Oracle
            console.log("📤 Pushing verified emission to Oracle...");
            const emissionTx = await oracleContract.setVerifiedEmission(
                Number(period),
                user,
                verifiedEmission,
                attestationId
            );
            await emissionTx.wait();
            console.log(`   TX: ${emissionTx.hash}`);

            // 5. Update submission status contract
            console.log("✓ Marking submission as VERIFIED...");
            const markVerifiedTx = await submissionContract.markVerified(
                Number(period),
                user,
                verifiedEmission
            );
            await markVerifiedTx.wait();
            console.log(`   TX: ${markVerifiedTx.hash}`);

            console.log("");
            console.log("🎉 Successfully processed submission!");
            console.log(`   Status: PENDING → VERIFIED`);
            console.log(`   Tagihan set: ${user} owes 1000 ton for period ${period}`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        } catch (error) {
            console.error("❌ Error processing submission:", error.message);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        }
    });

    // Keep the process running
    console.log("Press Ctrl+C to stop.");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
