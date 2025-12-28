"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatUnits } from "ethers"
import { Loader2, Leaf, Factory, RefreshCw } from "lucide-react"
import { getSPEBalance, getPTBAEBalanceForPeriod } from "@/lib/contracts"
import { getCompliancePeriods } from "@/app/actions/period-actions"

// Format balance from wei (18 decimals) to Ton CO2e
function formatTon(weiValue: string): string {
    try {
        const formatted = formatUnits(weiValue, 18)
        // Remove trailing zeros after decimal
        const num = parseFloat(formatted)
        return num.toLocaleString('id-ID', { maximumFractionDigits: 2 })
    } catch {
        return "0"
    }
}

export default function CompanyDashboard() {
    const { data: session } = useSession()
    const { address } = useAccount()

    const [ptbaeBalance, setPtbaeBalance] = useState<string>("0")
    const [speBalance, setSpeBalance] = useState<string>("0")
    const [refreshKey, setRefreshKey] = useState(0)
    const [tokenId, setTokenId] = useState("1") // Default SPE Token ID

    useEffect(() => {
        async function fetchData() {
            if (address) {
                try {
                    // Get total PTBAE by summing all period balances
                    const periods = await getCompliancePeriods()
                    let totalPtbae = BigInt(0)
                    for (const period of periods) {
                        const balance = await getPTBAEBalanceForPeriod(address, period.year)
                        totalPtbae += BigInt(balance)
                    }
                    setPtbaeBalance(totalPtbae.toString())

                    // SPE balance
                    const spe = await getSPEBalance(address, Number(tokenId))
                    setSpeBalance(spe)
                } catch (error) {
                    console.error("Error fetching balances:", error)
                }
            }
        }
        fetchData()
    }, [address, refreshKey, tokenId])

    if (!session) return <div>Access Denied</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Company Dashboard</h1>
                    <p className="text-muted-foreground">{session.user?.companyName}</p>
                </div>
                <Button variant="outline" size="icon" onClick={() => setRefreshKey(p => p + 1)}>
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            {/* Asset Overview */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-slate-900 text-white border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">PTBAE Quota Balance</CardTitle>
                        <Factory className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatTon(ptbaeBalance)} Ton</div>
                        <p className="text-xs text-slate-400">Emission Allowance (Ton CO2e)</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-700 text-white border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">SPE Credit Balance</CardTitle>
                        <Leaf className="h-4 w-4 text-green-200" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatTon(speBalance)} Ton</div>
                        <p className="text-xs text-green-200">Carbon Offset Credits (Token ID: {tokenId})</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
