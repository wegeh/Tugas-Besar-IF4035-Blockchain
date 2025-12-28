"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Calendar, RefreshCw } from "lucide-react"
import { getPTBAEBalanceForPeriod } from "@/lib/contracts"
import { getCompliancePeriods } from "@/app/actions/period-actions"
import { formatUnits } from "ethers"

// Format balance from wei to Ton
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

export default function AllocationsPage() {
    const { address } = useAccount()
    const [periodAllocations, setPeriodAllocations] = useState<PeriodAllocation[]>([])
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        async function fetchAllocations() {
            if (!address) return
            setLoading(true)
            try {
                // Step 1: Get periods from Database
                const periods = await getCompliancePeriods()

                // Step 2: For each period, get balance from Smart Contract
                const allocations: PeriodAllocation[] = await Promise.all(
                    periods.map(async (period) => {
                        const balance = await getPTBAEBalanceForPeriod(address, period.year)
                        return {
                            year: period.year,
                            balance,
                            status: period.status,
                            tokenAddress: period.tokenAddress
                        }
                    })
                )
                setPeriodAllocations(allocations)
            } catch (error) {
                console.error("Error fetching allocations:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchAllocations()
    }, [address, refreshKey])

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">PTBAE Allocations</h1>
                    <p className="text-muted-foreground">
                        View your emission allowance allocations per compliance period
                    </p>
                </div>
                <Button variant="outline" size="icon" onClick={() => setRefreshKey(p => p + 1)}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {loading && periodAllocations.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : periodAllocations.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Calendar className="h-12 w-12 mb-4 opacity-50" />
                        <p>No compliance periods found.</p>
                        <p className="text-sm">Allocations will appear here once the regulator creates a period.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {periodAllocations.map((allocation) => (
                        <Card key={allocation.year} className={allocation.status === 'ACTIVE' ? "border-green-500/50" : ""}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full 
                                        ${allocation.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900' :
                                            allocation.status === 'AUDIT' ? 'bg-yellow-100 dark:bg-yellow-900' :
                                                'bg-gray-100 dark:bg-gray-800'}`}>
                                        <Calendar className={`h-5 w-5 
                                            ${allocation.status === 'ACTIVE' ? 'text-green-600' :
                                                allocation.status === 'AUDIT' ? 'text-yellow-600' :
                                                    'text-gray-500'}`} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Period {allocation.year}</CardTitle>
                                        <CardDescription>Compliance Year {allocation.year}</CardDescription>
                                    </div>
                                </div>
                                <Badge variant={allocation.status === 'ACTIVE' ? "default" : "secondary"}
                                    className={`flex items-center gap-1 ${allocation.status === 'ACTIVE' ? 'bg-green-600' :
                                        allocation.status === 'AUDIT' ? 'bg-yellow-600 text-white hover:bg-yellow-700' : ''
                                        }`}>
                                    {allocation.status}
                                </Badge>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold">{formatTon(allocation.balance)}</span>
                                    <span className="text-muted-foreground">Ton CO2e</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Emission allowance allocated for this period
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Data Source Info */}
            <Card className="bg-muted/50">
                <CardContent className="py-4">
                    <p className="text-xs text-muted-foreground">
                        <strong>Data Sources:</strong> Period list from Database • Balances from Smart Contract
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
