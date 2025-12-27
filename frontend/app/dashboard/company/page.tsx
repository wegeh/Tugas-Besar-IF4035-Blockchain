"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { getPTBAEBalance, getSPEBalance, getPtbaeContract, getSpeContract, getSigner } from "@/lib/contracts"
import { Loader2, Leaf, Factory, RefreshCw, LayoutDashboard, Send } from "lucide-react"
import { Label } from "@/components/ui/label"
import { DashboardShell } from "@/components/dashboard-shell"

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

    useEffect(() => {
        async function fetchData() {
            if (address) {
                const ptbae = await getPTBAEBalance(address)
                const spe = await getSPEBalance(address, Number(tokenId))
                setPtbaeBalance(ptbae)
                setSpeBalance(spe)
            }
        }
        fetchData()
    }, [address, refreshKey, tokenId])

    const handleSurrender = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!surrenderAmount) return
        setLoading(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer)
            const amountWei = BigInt(surrenderAmount)
            const tx = await contract.surrender(amountWei)
            await tx.wait()
            toast.success("Success", { description: `Surrendered ${surrenderAmount} PTBAE Quota.` })
            setRefreshKey(p => p + 1)
        } catch (error: any) {
            console.error(error)
            toast.error("Surrender Failed", { description: "Check console for details." })
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
            const amount = BigInt(retireAmount)
            const tx = await contract.retireSPE(tokenId, amount)
            await tx.wait()
            toast.success("Success", { description: `Retired ${retireAmount} SPE Credits.` })
            setRefreshKey(p => p + 1)
        } catch (error: any) {
            console.error(error)
            toast.error("Retire Failed", { description: "Check console for details." })
        } finally {
            setLoading(false)
        }
    }

    const menuItems = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
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
                                    <div className="text-2xl font-bold">{ptbaeBalance} Units</div>
                                    <p className="text-xs text-slate-400">Emission Allowance (Ton CO2e)</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-green-700 text-white border-none">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">SPE Credit Balance</CardTitle>
                                    <Leaf className="h-4 w-4 text-green-200" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{speBalance} Credits</div>
                                    <p className="text-xs text-green-200">Carbon Offset Credits (Token ID: {tokenId})</p>
                                </CardContent>
                            </Card>
                        </div>
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
