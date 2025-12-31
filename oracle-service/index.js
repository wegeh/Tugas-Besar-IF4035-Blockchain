/**
 * Oracle Service for Carbon Ledger ID
 * 
 * Listens to EmissionSubmitted events from blockchain,
 * fetches documents from local IPFS, verifies (simplified),
 * and pushes verified emission to MRVOracle contract.
 * 
 * Also handles initial base price setting for markets (dummy oracle).
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load config from frontend addresses
const addressesPath = path.join(__dirname, "..", "frontend", "abi", "addresses.local.json");
const submissionAbiPath = path.join(__dirname, "..", "frontend", "abi", "EmissionSubmission.json");
const registryAbiPath = path.join(__dirname, "..", "frontend", "abi", "GreenProjectRegistry.json");
const oracleAbiPath = path.join(__dirname, "..", "frontend", "abi", "MRVOracle.json");


// Configuration
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// (Dummy price constants and market creation function removed per refinement)

async function main() {
    console.log("[Oracle] Starting Oracle Service...");

    if (!fs.existsSync(addressesPath)) {
        console.error("[Error] addresses.local.json not found.");
        process.exit(1);
    }

    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const submissionAbi = JSON.parse(fs.readFileSync(submissionAbiPath, "utf8")).abi;
    const registryAbi = JSON.parse(fs.readFileSync(registryAbiPath, "utf8")).abi;
    const oracleAbi = JSON.parse(fs.readFileSync(oracleAbiPath, "utf8")).abi;

    console.log(`EmissionSubmission: ${addresses.EmissionSubmission?.address}`);
    console.log(`GreenProjectRegistry: ${addresses.GreenProjectRegistry?.address}`);
    console.log(`MRVOracle: ${addresses.MRVOracle?.address}`);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let signer;
    const accounts = await provider.listAccounts();
    if (accounts.length > 0) {
        signer = await provider.getSigner(accounts[0].address);
    } else {
        signer = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);
    }

    const submissionContract = new ethers.Contract(addresses.EmissionSubmission.address, submissionAbi, signer);
    const registryContract = new ethers.Contract(addresses.GreenProjectRegistry.address, registryAbi, signer);
    const oracleContract = new ethers.Contract(addresses.MRVOracle.address, oracleAbi, signer);

    // --- 1. Listen for PTBAE Emissions ---
    console.log("[Oracle] Listening for EmissionSubmitted events (PTBAE)...");
    submissionContract.on("EmissionSubmitted", async (user, period, ipfsHash) => {
        console.log(`[PTBAE] New Submission: ${user} (Period ${period})`);
        try {
            // Mock verification for PTBAE
            const verifiedEmission = ethers.parseUnits("300", 18);

            // Attest & Set Emission
            const attestionId = ethers.keccak256(ethers.toUtf8Bytes(`ptbae-${period}-${user}`));
            await (await oracleContract.attestMRV(attestionId, ethers.ZeroHash, ethers.ZeroHash)).wait();
            await (await oracleContract.setVerifiedEmission(period, user, verifiedEmission, attestionId)).wait();

            // Update Status
            await (await submissionContract.markVerified(period, user, verifiedEmission)).wait();
            console.log("[PTBAE] Verified");
        } catch (e) {
            console.error("[PTBAE] Error:", e.message);
        }
    });

    // --- 2. Listen for Green Projects (SPE) ---
    console.log("[Oracle] Listening for ProjectSubmitted events (SPE-GRK)...");
    registryContract.on("ProjectSubmitted", async (user, index, ipfsHash) => {
        console.log("-------------------------------------------------");
        console.log("[SPE] New Green Project Submitted!");
        console.log(`   User:  ${user}`);
        console.log(`   Index: ${index}`);
        console.log(`   IPFS:  ${ipfsHash}`);

        try {
            // 1. Verify Project 
            // In real world, fetch IPFS and check data.
            // Here we assume it's valid.
            const verifiedAmount = ethers.parseUnits("500", 18); // Example: 500 Credits
            console.log(`[SPE] Verified Amount: 500 SPE`);

            // 2. Create Attestation (Required for Issuance)
            const attestationId = ethers.solidityPackedKeccak256(
                ["string", "address", "string"],
                ["spe", user, ipfsHash]
            );

            // Parse Metadata components to compute metaHash
            // Format: SPE|projectId|vintage|methodology|registryRef|realIpfsHash
            const parts = ipfsHash.split("|");

            // Fallback for empty/wrong format
            const projectId = parts[1] || "";
            const vintage = parseInt(parts[2]) || 0;
            const methodology = parts[3] || "";
            const registryRef = parts[4] || "";

            // Compute metaHash matching SPEGRKToken.sol logic:
            // keccak256(abi.encode(projectId, vintage, methodology, registryRef))
            const coder = ethers.AbiCoder.defaultAbiCoder();
            const metaHash = ethers.keccak256(
                coder.encode(
                    ["string", "uint16", "string", "string"],
                    [projectId, vintage, methodology, registryRef]
                )
            );

            // docHash is hash of the full data string (acting as document)
            const docHash = ethers.keccak256(ethers.toUtf8Bytes(ipfsHash));

            console.log(`[SPE] Computed MetaHash: ${metaHash}`);
            console.log("[SPE] Creating Attestation...");
            const tx1 = await oracleContract.attestMRV(attestationId, docHash, metaHash);
            await tx1.wait();

            // 3. Mark in Registry
            console.log("[SPE] Marking Project as VERIFIED...");
            const tx2 = await registryContract.markVerified(user, index, verifiedAmount);
            await tx2.wait();

            console.log("[SPE] Project Verified! Regulator can now issue tokens.");
            console.log("-------------------------------------------------\n");
        } catch (e) {
            console.error("[SPE] Error:", e.message);
            try {
                // Attempt to mark as REJECTED on chain
                // Truncate error message to avoid excessive gas/length
                const reason = e.message ? e.message.slice(0, 100) : "Unknown Error";
                console.log(`[SPE] Rejecting project on-chain (Reason: ${reason})...`);
                const txReject = await registryContract.markRejected(user, index, reason);
                await txReject.wait();
                console.log("[SPE] Project marked as REJECTED.");
            } catch (rejectErr) {
                console.error("[SPE] Failed to reject on-chain:", rejectErr.message);
            }
        }
    });

    console.log("[Oracle] Ready and listening for events...");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

