"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Loader2, Wallet, Coins, Clock } from "lucide-react"
import { formatUnits } from "ethers"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import {
    getSigner,
    forwarderAddress,
    getIdrcContract,
    getIdrcBalance,
    getNextFaucetClaim,
    idrsAddress
} from "@/lib/contracts"

function formatBalance(weiValue: string): string {
    try {
        const formatted = formatUnits(weiValue, 18)
        const num = parseFloat(formatted)
        return num.toLocaleString("id-ID", { maximumFractionDigits: 2 })
    } catch {
        return "0"
    }
}

export default function WalletPage() {
    const { address } = useAccount()

    const [idrcBalance, setIdrcBalance] = useState("0")
    const [nextFaucetClaim, setNextFaucetClaim] = useState(0)
    const [loading, setLoading] = useState(true)
    const [claiming, setClaiming] = useState(false)

    useEffect(() => {
        if (address) {
            loadData()
        }
    }, [address])

    async function loadData() {
        if (!address) return
        setLoading(true)
        try {
            const [balance, nextClaim] = await Promise.all([
                getIdrcBalance(address),
                getNextFaucetClaim(address),
            ])

            setIdrcBalance(balance)
            setNextFaucetClaim(nextClaim)
        } catch (error) {
            console.error("Error loading wallet data:", error)
        } finally {
            setLoading(false)
        }
    }

    async function handleClaimFaucet() {
        setClaiming(true)
        try {
            const signer = await getSigner()
            const idrcContract = getIdrcContract(signer)

            const data = idrcContract.interface.encodeFunctionData("claimFaucet", [])

            toast.info("Signing faucet claim...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, idrsAddress, data)

            toast.info("Processing claim...")
            await sendMetaTx(request, signature)

            toast.success("Berhasil klaim 1,000,000 IDRC!")
            loadData()
        } catch (error: any) {
            console.error("Faucet claim error:", error)
            if (error.message?.includes("cooldown")) {
                toast.error("Cooldown belum selesai. Tunggu 24 jam.")
            } else {
                toast.error("Gagal klaim faucet: " + error.message)
            }
        } finally {
            setClaiming(false)
        }
    }



    const canClaimFaucet = nextFaucetClaim === 0 || Date.now() / 1000 > nextFaucetClaim

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Wallet</h1>
                <p className="text-muted-foreground">
                    Kelola saldo IDRC (Carbon Rupiah) untuk trading
                </p>
            </div>

            {/* IDRC Balance */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Coins className="h-6 w-6 text-yellow-500" />
                        <CardTitle>Saldo IDRC</CardTitle>
                    </div>
                    <CardDescription>
                        Carbon Rupiah - Token pembayaran untuk trading karbon
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-4xl font-bold text-yellow-600">
                                {formatBalance(idrcBalance)}
                            </p>
                            <p className="text-sm text-muted-foreground">IDRC (Carbon Rupiah)</p>
                        </div>
                        <Wallet className="h-16 w-16 text-muted-foreground/30" />
                    </div>
                </CardContent>
            </Card>

            {/* Faucet */}
            <Card>
                <CardHeader>
                    <CardTitle>Faucet IDRC</CardTitle>
                    <CardDescription>
                        Klaim IDRC gratis untuk demo trading (1 juta IDRC per 24 jam)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {canClaimFaucet ? (
                        <Button
                            onClick={handleClaimFaucet}
                            disabled={claiming}
                            className="w-full bg-yellow-600 hover:bg-yellow-700"
                        >
                            {claiming ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Coins className="mr-2 h-4 w-4" />
                            )}
                            Klaim 1,000,000 IDRC
                        </Button>
                    ) : (
                        <Alert>
                            <Clock className="h-4 w-4" />
                            <AlertTitle>Cooldown Aktif</AlertTitle>
                            <AlertDescription>
                                Anda bisa klaim lagi pada:{" "}
                                {new Date(nextFaucetClaim * 1000).toLocaleString("id-ID")}
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
