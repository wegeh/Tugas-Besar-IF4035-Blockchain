import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import ForwarderABI from "@/abi/Forwarder.json"
import addresses from "@/abi/addresses.local.json"

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { request, signature } = body

        if (!request || !signature) {
            return NextResponse.json({ error: "Missing request or signature" }, { status: 400 })
        }

        const provider = new ethers.JsonRpcProvider(addresses.rpc)

        let signer: any
        try {
            const accounts = await provider.listAccounts()
            if (accounts.length > 0) {
                signer = await provider.getSigner(0)
            }
        } catch (e) {
            console.warn("Could not get signer from node:", e)
        }

        if (!signer) {
            const pk = process.env.RELAYER_PRIVATE_KEY
            if (pk) {
                signer = new ethers.Wallet(pk, provider)
            } else {
                throw new Error("No relayer signer available")
            }
        }

        const providerNetwork = await signer.provider?.getNetwork()
        const chainId = Number(providerNetwork?.chainId || 1515)

        const forwarder = new ethers.Contract(addresses.Forwarder.address, ForwarderABI.abi, signer)

        const forwardRequestData = {
            from: request.from,
            to: request.to,
            value: BigInt(request.value),
            gas: BigInt(request.gas),
            deadline: Number(request.deadline),
            data: request.data,
            signature: signature
        }

        const onChainNonce = await forwarder.nonces(request.from)
        if (onChainNonce.toString() !== request.nonce.toString()) {
            return NextResponse.json({
                error: `Nonce mismatch: on-chain=${onChainNonce}, request=${request.nonce}`
            }, { status: 400 })
        }

        const isValid = await forwarder.verify(forwardRequestData)
        if (!isValid) {
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
