/**
 * Oracle Service for Carbon Ledger ID
 * 
 * Functions:
 * 1. HTTP API: Provides signed carbon price for IDRS compliance payment
 * 2. Event Listener: Listens to EmissionSubmitted & ProjectSubmitted events
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

require("dotenv").config();

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Initialize PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://carbon_user:carbon_pass@localhost:5432/carbon_db"
});

// Config from addresses
const addressesPath = path.join(__dirname, "..", "frontend", "abi", "addresses.local.json");
const submissionAbiPath = path.join(__dirname, "..", "frontend", "abi", "EmissionSubmission.json");
const registryAbiPath = path.join(__dirname, "..", "frontend", "abi", "GreenProjectRegistry.json");
const oracleAbiPath = path.join(__dirname, "..", "frontend", "abi", "MRVOracle.json");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PORT = process.env.PORT || 3001;
const BASE_RATE = BigInt("30000000000000000000000"); // Rp 30,000 in wei

// --- API Endpoints ---

// Health Check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Get Signed Carbon Price
app.get("/carbon-price", async (req, res) => {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const oracleWallet = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

        // Query Market table for lastClearingPrice using native SQL
        const query = `
            SELECT "marketKey", "lastClearingPrice" 
            FROM "Market" 
            WHERE "isOpen" = true AND "lastClearingPrice" IS NOT NULL
            ORDER BY "updatedAt" DESC
        `;
        const result = await pool.query(query);

        // Calculate highest market price
        let marketPrice = BigInt(0);
        const marketKeys = [];

        for (const row of result.rows) {
            if (row.lastClearingPrice) {
                const price = BigInt(row.lastClearingPrice);
                if (price > marketPrice) {
                    marketPrice = price;
                }
                marketKeys.push(row.marketKey);
            }
        }

        // If no market data, use base rate
        if (marketPrice === BigInt(0)) {
            marketPrice = BASE_RATE;
            marketKeys.push("BASE_RATE_FALLBACK");
        }

        // Effective Rate: Max(Base, Market)
        const effectiveRate = marketPrice > BASE_RATE ? marketPrice : BASE_RATE;
        const timestamp = Math.floor(Date.now() / 1000);

        // Sign the data: Hash(rate, timestamp)
        const messageHash = ethers.solidityPackedKeccak256(
            ["uint256", "uint256"],
            [effectiveRate.toString(), timestamp]
        );
        const signature = await oracleWallet.signMessage(ethers.getBytes(messageHash));

        res.json({
            rate: effectiveRate.toString(),
            baseRate: BASE_RATE.toString(),
            marketRate: marketPrice.toString(),
            timestamp,
            signature,
            marketKeys,
            oracleAddress: oracleWallet.address
        });
    } catch (error) {
        console.error("Price API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Blockchain Event Listeners ---

// Transaction queue to prevent nonce conflicts
let txQueue = Promise.resolve();
let currentNonce = null;

async function queueTransaction(fn) {
    // Chain transactions to ensure they run sequentially
    txQueue = txQueue.then(async () => {
        try {
            await fn();
        } catch (error) {
            console.error("[TX Queue] Error:", error.message);
        }
    });
    return txQueue;
}

async function startListeners() {
    console.log("[Oracle] Starting Event Listeners...");

    if (!fs.existsSync(addressesPath)) {
        console.error("[Error] addresses.local.json not found.");
        return;
    }

    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const submissionAbi = JSON.parse(fs.readFileSync(submissionAbiPath, "utf8")).abi;
    const registryAbi = JSON.parse(fs.readFileSync(registryAbiPath, "utf8")).abi;
    const oracleAbi = JSON.parse(fs.readFileSync(oracleAbiPath, "utf8")).abi;

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

    const submissionContract = new ethers.Contract(addresses.EmissionSubmission.address, submissionAbi, signer);
    const registryContract = new ethers.Contract(addresses.GreenProjectRegistry.address, registryAbi, signer);
    const oracleContract = new ethers.Contract(addresses.MRVOracle.address, oracleAbi, signer);

    // 1. PTBAE Listener
    submissionContract.on("EmissionSubmitted", async (user, period, ipfsHash) => {
        console.log(`[PTBAE] New Submission: ${user} (Period ${period})`);
        queueTransaction(async () => {
            const verifiedEmission = ethers.parseUnits("300", 18);
            const docHash = ethers.keccak256(ethers.toUtf8Bytes(ipfsHash));
            const metaHash = ethers.ZeroHash;

            console.log("[PTBAE] Finalizing...");
            const tx = await oracleContract.finalizeEmission(
                period, user, verifiedEmission, docHash, metaHash, ipfsHash, "QmVerificationReport"
            );
            await tx.wait();
            console.log("[PTBAE] Finalized.");

            await (await submissionContract.markVerified(period, user, verifiedEmission)).wait();
            console.log("[PTBAE] Marked Verified.");
        });
    });

    // 2. SPE Listener
    registryContract.on("ProjectSubmitted", async (user, index, ipfsHash) => {
        console.log(`[SPE] New Project: ${user} #${index}`);
        queueTransaction(async () => {
            const verifiedAmount = ethers.parseUnits("500", 18);
            const attestationId = ethers.solidityPackedKeccak256(["string", "address", "string"], ["spe", user, ipfsHash]);

            const parts = ipfsHash.split("|");
            const projectId = parts[1] || "";
            const vintage = parseInt(parts[2]) || 0;
            const methodology = parts[3] || "";
            const registryRef = parts[4] || "";

            const coder = ethers.AbiCoder.defaultAbiCoder();
            const metaHash = ethers.keccak256(coder.encode(
                ["string", "uint16", "string", "string"],
                [projectId, vintage, methodology, registryRef]
            ));
            const docHash = ethers.keccak256(ethers.toUtf8Bytes(ipfsHash));
            const expiryDuration = 30 * 24 * 3600;

            console.log("[SPE] Attesting...");
            const tx1 = await oracleContract.attestProject(attestationId, verifiedAmount, docHash, metaHash, expiryDuration);
            await tx1.wait();

            await (await registryContract.markVerified(user, index, verifiedAmount)).wait();
            console.log("[SPE] Verified.");
        });
    });

    console.log("[Oracle] Listeners Active.");
}

// Start Server & Listeners
app.listen(PORT, async () => {
    console.log(`[Oracle] API Server running on port ${PORT}`);
    await startListeners();
});
