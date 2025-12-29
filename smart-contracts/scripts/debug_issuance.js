const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const addresses = JSON.parse(fs.readFileSync(path.join(__dirname, "../../frontend/abi/addresses.local.json"), "utf8"));
    const [signer] = await hre.ethers.getSigners();
    console.log("Debugger running as:", signer.address);

    const speToken = await hre.ethers.getContractAt("SPEGRKToken", addresses.SPEGRKToken.address);
    const oracle = await hre.ethers.getContractAt("MRVOracle", addresses.MRVOracle.address);
    const registry = await hre.ethers.getContractAt("GreenProjectRegistry", addresses.GreenProjectRegistry.address);

    // 1. Check Role
    const REGULATOR_ROLE = await speToken.REGULATOR_ROLE();
    const hasRole = await speToken.hasRole(REGULATOR_ROLE, signer.address);
    console.log(`User ${signer.address} has REGULATOR_ROLE? ${hasRole}`);

    // 2. Fetch Latest Submission
    const filter = registry.filters.ProjectSubmitted();
    const events = await registry.queryFilter(filter);
    if (events.length === 0) {
        console.log("No ProjectSubmitted events found.");
        return;
    }
    const lastEvent = events[events.length - 1];
    const { user, ipfsHash } = lastEvent.args;
    console.log("Latest Submission:", { user, ipfsHash });

    // 3. Reconstruct Attestation ID locally (Matches Oracle & Frontend)
    const attestationId = hre.ethers.solidityPackedKeccak256(
        ["string", "address", "string"],
        ["spe", user, ipfsHash]
    );
    console.log("Attestation ID:", attestationId);

    // 4. Check Oracle State
    const attestation = await oracle.getAttestation(attestationId);
    console.log("Oracle Attestation:", attestation);

    if (!attestation.valid) {
        console.error("❌ Attestation is INVALID in Oracle. Verify Oracle service is running and processing events.");
        return;
    }

    // 5. Reconstruct MetaHash locally
    const parts = ipfsHash.split("|");
    const projectId = parts[1] || "";
    const vintage = parseInt(parts[2]) || 0;
    const methodology = parts[3] || "";
    const registryRef = parts[4] || "";

    const meta = {
        projectId,
        vintageYear: vintage,
        methodology,
        registryRef
    };

    const coder = new hre.ethers.AbiCoder();
    const computedMetaHash = hre.ethers.keccak256(
        coder.encode(
            ["string", "uint16", "string", "string"],
            [meta.projectId, meta.vintageYear, meta.methodology, meta.registryRef]
        )
    );
    console.log("Computed MetaHash (Local):", computedMetaHash);
    console.log("Oracle MetaHash:", attestation.metaHash);

    if (computedMetaHash !== attestation.metaHash) {
        console.error("❌ MetaHash Mismatch! Oracle stored hash does not match input data.");
        return;
    }

    // 6. Check Trusted Forwarder
    const isTrusted = await speToken.isTrustedForwarder(addresses.Forwarder.address);
    console.log(`Forwarder ${addresses.Forwarder.address} trusted? ${isTrusted}`);
    if (!isTrusted) {
        console.error("❌ Forwarder is NOT trusted by SPE contract. MetaTx will fail.");
    }

    // 7. Execute REAL Issuance via Forwarder (MetaTx Simulation)
    const uniqueProjectKey = hre.ethers.solidityPackedKeccak256(
        ["string", "uint16"],
        [meta.projectId, meta.vintageYear]
    );
    const tokenId = BigInt(uniqueProjectKey);
    const amount = hre.ethers.parseUnits("500", 18); // Example amount

    console.log("Preparing Meta-Transaction...");
    // Encode Function Data
    const data = speToken.interface.encodeFunctionData("issueSPE", [
        tokenId,
        user,
        amount,
        meta,
        attestationId
    ]);

    const forwarder = await hre.ethers.getContractAt("Forwarder", addresses.Forwarder.address);
    const nonce = await forwarder.nonces(signer.address);
    const chainId = (await signer.provider.getNetwork()).chainId;

    const req = {
        from: signer.address,
        to: await speToken.getAddress(),
        value: 0,
        gas: 2000000,
        nonce: Number(nonce),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        data: data
    };

    const domain = {
        name: "Forwarder",
        version: "1",
        chainId: chainId,
        verifyingContract: addresses.Forwarder.address
    };

    const types = {
        ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint48" },
            { name: "data", type: "bytes" },
        ]
    };

    console.log("Signing Request...", { domain, req });
    const signature = await signer.signTypedData(domain, types, req);
    console.log("Signature:", signature);

    // Verify locally
    const recovered = hre.ethers.verifyTypedData(domain, types, req, signature);
    if (recovered.toLowerCase() !== signer.address.toLowerCase()) {
        console.error("❌ Local Signature Verification Failed!");
        return;
    }
    console.log("✅ Local Signature Verification Passed");

    // Execute via Forwarder
    console.log("Executing forwarder.execute()...");

    // Remove nonce from struct for OZ 5.x execution
    const { nonce: _, ...reqWithoutNonce } = req;
    const reqWithSig = {
        ...reqWithoutNonce,
        signature: signature
    };

    try {
        const tx = await forwarder.execute(reqWithSig);
        console.log("MetaTx Sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("✅ MetaTx Executed Successfully! Block:", receipt.blockNumber);
    } catch (e) {
        console.error("❌ MetaTx Execution FAILED:", e.message);
        if (e.data) {
            console.error("Revert Data:", e.data);
        }
    }
}

main().catch(console.error);
