"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { getPTBAEBalance, getSPEBalance, getPtbaeContract, getSpeContract, getSigner, forwarderAddress, getPTBAEBalanceForPeriod } from "@/lib/contracts"
import { Loader2, Leaf, Factory, RefreshCw, LayoutDashboard, Send, Calendar, CheckCircle, Clock } from "lucide-react"
import { Label } from "@/components/ui/label"
import { DashboardShell } from "@/components/dashboard-shell"
import { getCompliancePeriods, type CompliancePeriodData } from "@/app/actions/period-actions"
import { Badge } from "@/components/ui/badge"
import { formatUnits } from "ethers"

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

interface PeriodAllocation {
    year: number
    balance: string
    isActive: boolean
}

export default function CompanyDashboard() {
    const { data: session } = useSession()
    const { address } = useAccount()


    const [ptbaeBalance, setPtbaeBalance] = useState<string>("0")
    const [speBalance, setSpeBalance] = useState<string>("0")
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const [shellTab, setShellTab] = useState("overview")

    // Form States
    const [surrenderAmount, setSurrenderAmount] = useState("")
    const [retireAmount, setRetireAmount] = useState("")
    const [tokenId, setTokenId] = useState("1") // Default SPE Token ID
    const [periodAllocations, setPeriodAllocations] = useState<PeriodAllocation[]>([])
    const [allocationsLoading, setAllocationsLoading] = useState(false)

    useEffect(() => {
        async function fetchData() {
            if (address) {
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
            }
        }
        fetchData()
    }, [address, refreshKey, tokenId])

    // Fetch per-period allocations (Hybrid: DB for periods, SC for balances)
    useEffect(() => {
        async function fetchAllocations() {
            if (!address) return
            setAllocationsLoading(true)
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
                            isActive: period.isActive
                        }
                    })
                )
                setPeriodAllocations(allocations)
            } catch (error) {
                console.error("Error fetching allocations:", error)
            } finally {
                setAllocationsLoading(false)
            }
        }
        fetchAllocations()
    }, [address, refreshKey])

    const handleSurrender = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!surrenderAmount) return
        setLoading(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer)

            // Encode function data
            const amountWei = BigInt(surrenderAmount)
            const data = contract.interface.encodeFunctionData("surrender", [amountWei])
            const to = await contract.getAddress()

            // Create and Sign Meta-Tx (Gasless)
            toast.info("Signing Request", { description: "Please sign the gasless transaction in your wallet..." })
            const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)

            // Send to Relayer
            toast.info("Processing", { description: "Sending transaction to relayer..." })
            const result = await sendMetaTx(request, signature)

            toast.success("Success", { description: `Surrendered ${surrenderAmount} PTBAE Quota. Tx: ${result.txHash.slice(0, 10)}...` })
            setRefreshKey(p => p + 1)
        } catch (error: any) {
            console.error("Surrender Error:", error)
            const msg = error.message?.toLowerCase() || ""
            if (msg.includes("rejected")) {
                toast.error("Transaction rejected by user.")
            } else {
                toast.error("Surrender failed. Please try again.")
            }
        } finally {
            setLoading(false)
        }
    }

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
            setRefreshKey(p => p + 1)
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

    const menuItems = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "allocations", label: "Allocations", icon: Calendar },
        { id: "compliance", label: "Compliance", icon: Factory },
        { id: "offset", label: "Offsetting", icon: Leaf },
        { id: "reporting", label: "Reporting", icon: Send },
    ]

    if (!session) return <div>Access Denied</div>

    return (
        <DashboardShell activeTab={shellTab} setActiveTab={setShellTab} menuItems={menuItems}>
            <div className="container mx-auto py-6 space-y-8">

                {shellTab === "overview" && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-bold">Company Dashboard</h1>
                                <p className="text-muted-foreground">{session.user.companyName}</p>
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
                )}

                {shellTab === "allocations" && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-bold">PTBAE Allocations</h1>
                                <p className="text-muted-foreground">
                                    View your emission allowance allocations per compliance period
                                </p>
                            </div>
                            <Button variant="outline" size="icon" onClick={() => setRefreshKey(p => p + 1)}>
                                <RefreshCw className={`h-4 w-4 ${allocationsLoading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>

                        {allocationsLoading ? (
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
                                    <Card key={allocation.year} className={allocation.isActive ? "border-green-500/50" : ""}>
                                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-full ${allocation.isActive ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                                    <Calendar className={`h-5 w-5 ${allocation.isActive ? 'text-green-600' : 'text-gray-500'}`} />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-lg">Period {allocation.year}</CardTitle>
                                                    <CardDescription>Compliance Year {allocation.year}</CardDescription>
                                                </div>
                                            </div>
                                            <Badge variant={allocation.isActive ? "default" : "secondary"} className="flex items-center gap-1">
                                                {allocation.isActive ? (
                                                    <>
                                                        <Clock className="h-3 w-3" />
                                                        Active
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle className="h-3 w-3" />
                                                        Ended
                                                    </>
                                                )}
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
                                    <strong>Data Sources:</strong> Period list from Database • Balances from Smart Contract (PTBAEAllowanceToken.balanceOf)
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {shellTab === "compliance" && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Surrender Quota</CardTitle>
                            <CardDescription>Fulfill your compliance verification by surrendering allowances.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSurrender} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Amount to Surrender</Label>
                                    <Input
                                        type="number"
                                        placeholder="Amount"
                                        value={surrenderAmount}
                                        onChange={e => setSurrenderAmount(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" disabled={loading} variant="destructive">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Surrender Allowances
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {shellTab === "offset" && (
                    <Card>
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
                                        placeholder="Amount"
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
                )}

                {shellTab === "reporting" && (
                    <Card>
                        <CardHeader>
                            <CardTitle>MRV Reporting</CardTitle>
                            <CardDescription>Submit emission reports for verification.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                <p>Reporting module coming soon.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardShell>
    )
}
