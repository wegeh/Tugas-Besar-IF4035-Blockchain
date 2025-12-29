"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatUnits } from "ethers"
import { Loader2, Leaf, Factory, RefreshCw, Calendar } from "lucide-react"
import { getTotalSPEBalance, getPTBAEBalanceForPeriod } from "@/lib/contracts"
import { getCompliancePeriods } from "@/app/actions/period-actions"

// Format balance from wei (18 decimals) to Ton CO2e
function formatTon(weiValue: string): string {
    try {
        const formatted = formatUnits(weiValue, 18)
        const num = parseFloat(formatted)
        return num.toLocaleString('id-ID', { maximumFractionDigits: 2 })
    } catch {
        return "0"
    }
}

interface PeriodAllocation {
    year: number
    balance: string
    status: string
    tokenAddress: string
}

export default function CompanyDashboard() {
    const { data: session } = useSession()
    const { address } = useAccount()

    const [ptbaeBalance, setPtbaeBalance] = useState<string>("0")
    const [speBalance, setSpeBalance] = useState<string>("0")
    const [speTokenCount, setSpeTokenCount] = useState<number>(0)
    const [periodAllocations, setPeriodAllocations] = useState<PeriodAllocation[]>([])
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        async function fetchData() {
            if (!address) return
            setLoading(true)
            try {
                // Get periods from Database
                const periods = await getCompliancePeriods()

                // Get PTBAE balance for each period and calculate total
                let totalPtbae = BigInt(0)
                const allocations: PeriodAllocation[] = await Promise.all(
                    periods.map(async (period) => {
                        const balance = await getPTBAEBalanceForPeriod(address, period.year)
                        totalPtbae += BigInt(balance)
                        return {
                            year: period.year,
                            balance,
                            status: period.status,
                            tokenAddress: period.tokenAddress
                        }
                    })
                )
                setPtbaeBalance(totalPtbae.toString())
                setPeriodAllocations(allocations)

                // Get total SPE balance across all token IDs
                const speData = await getTotalSPEBalance(address)
                setSpeBalance(speData.total)
                setSpeTokenCount(speData.tokens.length)
            } catch (error) {
                console.error("Error fetching data:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [address, refreshKey])

    if (!session) return <div>Access Denied</div>

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Company Dashboard</h1>
                    <p className="text-muted-foreground">{session.user?.companyName}</p>
                </div>
                <Button variant="outline" size="icon" onClick={() => setRefreshKey(p => p + 1)} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Asset Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="bg-slate-900 text-white border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total PTBAE Quota</CardTitle>
                        <Factory className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatTon(ptbaeBalance)} Ton</div>
                        <p className="text-xs text-slate-400">Emission Allowance (Ton CO2e)</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-700 text-white border-none">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total SPE Credit</CardTitle>
                        <Leaf className="h-4 w-4 text-green-200" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatTon(speBalance)} Ton</div>
                        <p className="text-xs text-green-200">Carbon Offset Credits ({speTokenCount} Token Types)</p>
                    </CardContent>
                </Card>
            </div>

            {/* Period Allocations Section */}
            <div>
                <h2 className="text-xl font-semibold mb-4">PTBAE Allocations per Period</h2>

                {loading && periodAllocations.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : periodAllocations.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <Calendar className="h-10 w-10 mb-3 opacity-50" />
                            <p>No compliance periods found.</p>
                            <p className="text-sm">Allocations appear here once the regulator creates a period.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-3">
                        {periodAllocations.map((allocation) => (
                            <Card key={allocation.year} className={allocation.status === 'ACTIVE' ? "border-green-500/50" : ""}>
                                <CardContent className="flex items-center justify-between py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full 
                                            ${allocation.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900' :
                                                allocation.status === 'AUDIT' ? 'bg-yellow-100 dark:bg-yellow-900' :
                                                    'bg-gray-100 dark:bg-gray-800'}`}>
                                            <Calendar className={`h-4 w-4 
                                                ${allocation.status === 'ACTIVE' ? 'text-green-600' :
                                                    allocation.status === 'AUDIT' ? 'text-yellow-600' :
                                                        'text-gray-500'}`} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">Period {allocation.year}</CardTitle>
                                            <CardDescription className="text-xs">Compliance Year</CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-lg font-bold">{formatTon(allocation.balance)} Ton</div>
                                        </div>
                                        <Badge variant={allocation.status === 'ACTIVE' ? "default" : "secondary"}
                                            className={`${allocation.status === 'ACTIVE' ? 'bg-green-600' :
                                                allocation.status === 'AUDIT' ? 'bg-yellow-600 text-white' : ''}`}>
                                            {allocation.status}
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
