import { ethers } from "ethers"
import ForwarderABI from "@/abi/Forwarder.json"

export const EIP712Domain = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
]

export const ForwardRequest = [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
]

function getMetaTxTypeData(chainId: number, verifyingContract: string) {
    return {
        types: {
            EIP712Domain,
            ForwardRequest,
        },
        domain: {
            name: "Forwarder",
            version: "1",
            chainId,
            verifyingContract,
        },
        primaryType: "ForwardRequest",
    }
}

async function signMetaTxRequest(signer: ethers.Signer, forwarder: any, input: any, chainId: number) {
    const request = await buildRequest(forwarder, input)
    const toSign = getMetaTxTypeData(chainId, await forwarder.getAddress())

    // Use _signTypedData if available (ethers v6), otherwise fallback or metamask direct
    const signature = await signer.signTypedData(toSign.domain, { ForwardRequest }, request)
    return { signature, request }
}

async function buildRequest(forwarder: any, input: any) {
    const nonce = await forwarder.nonces(input.from)
    return {
        from: input.from,
        to: input.to,
        value: 0,
        gas: 2000000, // Reduced from 10M to ensure gasleft() > req.gas
        nonce: nonce,
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour validity
        data: input.data,
    }
}

export async function createMetaTx(
    signer: ethers.Signer,
    forwarderAddress: string,
    toContract: string,
    data: string
) {
    const from = await signer.getAddress()
    const network = await signer.provider?.getNetwork()
    const chainId = Number(network?.chainId || 1515)

    // Allow both 1515 (Configured) and 31337 (Hardhat Default)
    // If user is on 31337, we sign for 31337. If on 1515, we sign for 1515.
    // The node MUST match what we sign for.
    const ALLOWED_CHAINS = [1515, 31337]
    if (!ALLOWED_CHAINS.includes(chainId)) {
        throw new Error(`Wrong Network. Please switch Metamask to Localhost (1515 or 31337). Current: ${chainId}`)
    }

    const provider = signer.provider
    const forwarder = new ethers.Contract(forwarderAddress, ForwarderABI.abi, provider)

    // Build request
    const request = {
        from,
        to: toContract,
        data,
    }

    const { signature, request: signedReq } = await signMetaTxRequest(signer, forwarder, request, chainId)

    // JSON serializable request (BigInt issues handling)
    const jsonReq = {
        from: signedReq.from,
        to: signedReq.to,
        value: signedReq.value.toString(),
        gas: signedReq.gas.toString(),
        nonce: signedReq.nonce.toString(),
        deadline: signedReq.deadline.toString(),
        data: signedReq.data
    }

    return { request: jsonReq, signature }
}

export async function sendMetaTx(request: any, signature: string) {
    const response = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, signature }),
    })

    if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Relay failed")
    }

    return await response.json()
}
