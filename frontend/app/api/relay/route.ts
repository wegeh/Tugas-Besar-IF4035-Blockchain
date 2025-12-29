import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import ForwarderABI from "@/abi/Forwarder.json"
import addresses from "@/abi/addresses.local.json"

// Relayer Private Key (Admin Wallet)
// In production, use process.env.RELAYER_PRIVATE_KEY
// For local dev, we use the hardhat account #0 (Genesis Alloc)
const RELAYER_PRIVATE_KEY = "0x6C1D21A692A4a5e711172FB1D921e6fC6A2108e5"

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { request, signature } = body

        if (!request || !signature) {
            return NextResponse.json({ error: "Missing request or signature" }, { status: 400 })
        }

        console.log("Relaying transaction...", request)

        // 1. Setup Provider
        const provider = new ethers.JsonRpcProvider(addresses.rpc)

        // 2. Get Relayer Signer
        // Start by trying to use the node's unlocked account (common in private chains)
        // If that fails or no accounts are available, check for env var
        let signer: any
        try {
            const accounts = await provider.listAccounts()
            if (accounts.length > 0) {
                signer = await provider.getSigner(0)
                console.log("Using node account as relayer:", await signer.getAddress())
            }
        } catch (e) {
            console.warn("Could not get signer from node:", e)
        }

        // Fallback to Private Key if node signer failed
        if (!signer) {
            const pk = process.env.RELAYER_PRIVATE_KEY
            if (pk) {
                signer = new ethers.Wallet(pk, provider)
                console.log("Using private key wallet as relayer")
            } else {
                throw new Error("No relayer signer available. Ensure node account is unlocked or RELAYER_PRIVATE_KEY is set.")
            }
        }

        // 3. Connect to Forwarder Contract
        const providerNetwork = await signer.provider?.getNetwork();
        const chainId = Number(providerNetwork?.chainId || 1515); // Fallback to 1515
        console.log("DEBUG: Relayer Provider Chain ID:", chainId);

        // Explicitly cast to unknown first to avoid sizing issues with ABI type inference in some environments
        const forwarder = new ethers.Contract(addresses.Forwarder.address, ForwarderABI.abi, signer)

        // DEBUG: Verify Signature Off-Chain
        try {
            const domain = {
                name: "Forwarder",
                version: "1",
                chainId: chainId,
                verifyingContract: addresses.Forwarder.address
            }

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
            }

            // We need to ensure values are appropriate types (BigIntish)
            const reqValue = {
                from: request.from,
                to: request.to,
                value: request.value,
                gas: request.gas,
                nonce: request.nonce, // The nonce used during signing
                deadline: request.deadline,
                data: request.data
            }

            const recovered = ethers.verifyTypedData(domain, types, reqValue, signature)
            console.log("DEBUG: Recovered Address:", recovered)
            console.log("DEBUG: Request From:", request.from)

            if (recovered.toLowerCase() !== request.from.toLowerCase()) {
                console.error("DEBUG: SIGNATURE MISMATCH ON SERVER (Check ChainID or Nonce or TypeDef)")
            } else {
                console.log("DEBUG: Signature Verified Off-Chain Successfully")
            }
        } catch (e) {
            console.error("DEBUG: Verification failed:", e)
        }

        // 4. Execute Transaction
        console.log("Executing with request:", request)
        console.log("Signature:", signature)

        // ERC2771Forwarder v5 expects 'ForwardRequestData' struct.
        // Struct fields: from, to, value, gas, deadline, data, signature
        // The struct does NOT include 'nonce' field, but signature was made WITH nonce.
        const forwardRequestData = {
            from: request.from,
            to: request.to,
            value: BigInt(request.value),
            gas: BigInt(request.gas),
            deadline: Number(request.deadline),
            data: request.data,
            signature: signature
        }

        console.log("ForwardRequestData:", forwardRequestData)

        // Verify on-chain nonce matches
        const onChainNonce = await forwarder.nonces(request.from)
        console.log("On-chain nonce:", onChainNonce.toString())
        console.log("Request nonce:", request.nonce)
        if (onChainNonce.toString() !== request.nonce.toString()) {
            console.error("NONCE MISMATCH!")
            return NextResponse.json({
                error: `Nonce mismatch: on-chain=${onChainNonce}, request=${request.nonce}`
            }, { status: 400 })
        }

        // Verify signature on-chain
        const isValid = await forwarder.verify(forwardRequestData)
        console.log("forwarder.verify():", isValid)
        if (!isValid) {
            console.error("SIGNATURE INVALID ON-CHAIN")
            return NextResponse.json({
                error: "Signature verification failed on-chain. Please refresh and try again."
            }, { status: 400 })
        }

        const tx = await forwarder.execute(forwardRequestData, { gasLimit: 5000000 })
        console.log("Relay Tx Hash:", tx.hash)

        const receipt = await tx.wait()

        return NextResponse.json({
            success: true,
            txHash: receipt.hash
        })

    } catch (error: any) {
        console.error("Relay Error:", error)
        return NextResponse.json({
            error: error.message || "Relay failed"
        }, { status: 500 })
    }
}
