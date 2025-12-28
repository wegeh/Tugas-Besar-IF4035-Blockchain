"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { getSpeContract, getSigner, forwarderAddress } from "@/lib/contracts"

export default function OffsetPage() {
    const { address } = useAccount()
    const [loading, setLoading] = useState(false)
    const [retireAmount, setRetireAmount] = useState("")
    const [tokenId, setTokenId] = useState("1")

    const handleRetire = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!retireAmount) return
        setLoading(true)
        try {
            const signer = await getSigner()
            const contract = getSpeContract(signer)

            // Encode function data
            const amount = BigInt(retireAmount)
            const data = contract.interface.encodeFunctionData("retireSPE", [tokenId, amount])
            const to = await contract.getAddress()

            // Create and Sign Meta-Tx (Gasless)
            toast.info("Signing Request", { description: "Please sign the gasless transaction in your wallet..." })
            const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)

            // Send to Relayer
            toast.info("Processing", { description: "Sending transaction to relayer..." })
            const result = await sendMetaTx(request, signature)

            toast.success("Success", { description: `Retired ${retireAmount} SPE Credits. Tx: ${result.txHash.slice(0, 10)}...` })
            setRetireAmount("")
        } catch (error: any) {
            console.error("Retire Error:", error)
            const msg = error.message?.toLowerCase() || ""
            if (msg.includes("rejected")) {
                toast.error("Transaction rejected by user.")
            } else {
                toast.error("retirement failed. Please try again.")
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Offsetting</h1>
                <p className="text-muted-foreground">
                    Voluntary offsetting by retiring SPEGRK credits.
                </p>
            </div>

            <Card className="max-w-xl">
                <CardHeader>
                    <CardTitle>Retire SPE Credits</CardTitle>
                    <CardDescription>Permanently retire credits to offset carbon footprint.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRetire} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Token ID</Label>
                            <Input
                                type="number"
                                value={tokenId}
                                onChange={e => setTokenId(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Amount to Retire</Label>
                            <Input
                                type="number"
                                holder="Amount"
                                value={retireAmount}
                                onChange={e => setRetireAmount(e.target.value)}
                            />
                        </div>
                        <Button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Retire Credits
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
