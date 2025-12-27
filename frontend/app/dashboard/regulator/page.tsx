
"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getCurrentPeriod, getPtbaeContract, getSigner } from "@/lib/contracts"
import { Loader2, Send, LayoutDashboard, FileText } from "lucide-react"
import { toast } from "sonner"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import { DashboardShell } from "@/components/dashboard-shell"

import { getRegisteredCompanies, CompanyData } from "@/app/actions/get-companies"

export default function RegulatorDashboard() {
    const { data: session } = useSession()

    const [currentPeriod, setCurrentPeriod] = useState<number>(0)
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const [shellTab, setShellTab] = useState("overview")

    // Data States
    const [companies, setCompanies] = useState<CompanyData[]>([])
    const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set())

    // Form States
    const [newPeriodYear, setNewPeriodYear] = useState("")
    const [allocateAmount, setAllocateAmount] = useState("")

    useEffect(() => {
        async function fetchData() {
            const period = await getCurrentPeriod()
            setCurrentPeriod(period)

            const companiesData = await getRegisteredCompanies()
            setCompanies(companiesData)
        }
        fetchData()
    }, [refreshKey])

    const toggleCompany = (address: string) => {
        const next = new Set(selectedCompanies)
        if (next.has(address)) {
            next.delete(address)
        } else {
            next.add(address)
        }
        setSelectedCompanies(next)
    }

    const toggleAll = () => {
        if (selectedCompanies.size === companies.length) {
            setSelectedCompanies(new Set())
        } else {
            setSelectedCompanies(new Set(companies.map(c => c.walletAddress)))
        }
    }

    const handleOpenPeriod = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newPeriodYear) return
        setLoading(true)
        try {
            const signer = await getSigner()
            toast.info("Coming Soon", { description: "Period management requires Factory ABI integration." })
        } catch (error: any) {
            console.error(error)
            toast.error("Failed to open period", { description: "Check console for details." })
        } finally {
            setLoading(false)
        }
    }

    const handleBatchAllocate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (selectedCompanies.size === 0 || !allocateAmount) {
            toast.error("Validation Error", { description: "Please select at least one company and enter an amount." })
            return
        }

        setLoading(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer)
            const amountWei = BigInt(allocateAmount) * BigInt(10 ** 18)
            const addresses = Array.from(selectedCompanies)

            toast.info("Processing", { description: `Allocating batch to ${addresses.length} companies...` })

            // Single transaction for batch allocation
            const tx = await contract.batchAllocate(addresses, amountWei)
            await tx.wait()

            toast.success("Batch Allocation Complete", { description: `Successfully allocated to ${addresses.length} companies.` })
            setRefreshKey(p => p + 1)
            setSelectedCompanies(new Set())
            setAllocateAmount("")

        } catch (error: any) {
            console.error(error)
            toast.error("Allocation Failed", { description: "Check console for details." })
        } finally {
            setLoading(false)
        }
    }

    const menuItems = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "allocation", label: "Allocation", icon: FileText },
        { id: "verification", label: "Verification", icon: Send },
    ]

    if (!session) return <div>Access Denied</div>

    return (
        <DashboardShell activeTab={shellTab} setActiveTab={setShellTab} menuItems={menuItems}>
            <div className="container mx-auto py-6 space-y-8">
                {shellTab === "overview" && (
                    <div className="space-y-6">
                        <div>
                            <h1 className="text-3xl font-bold">Regulator Dashboard</h1>
                            <p className="text-muted-foreground">Republik Indonesia National Registry System</p>
                        </div>
                        <Card className="w-full md:w-1/3">
                            <CardHeader className="py-4">
                                <CardTitle className="text-lg">Current Period</CardTitle>
                                <CardDescription className="text-2xl font-bold text-primary">
                                    {currentPeriod || "-"}
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </div>
                )}

                {shellTab === "allocation" && (
                    <Card className="w-full">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                            <div>
                                <CardTitle>Allocation Management</CardTitle>
                                <CardDescription>Manage compliance periods and distribute allowances.</CardDescription>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="flex items-center space-x-2 border-r pr-4 mr-2">
                                    <Input
                                        className="w-24 h-9"
                                        placeholder="Year"
                                        type="number"
                                        value={newPeriodYear}
                                        onChange={e => setNewPeriodYear(e.target.value)}
                                    />
                                    <Button size="sm" variant="outline" onClick={handleOpenPeriod} disabled={loading}>
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Period"}
                                    </Button>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Input
                                        className="w-32 h-9"
                                        placeholder="Amount"
                                        type="number"
                                        value={allocateAmount}
                                        onChange={e => setAllocateAmount(e.target.value)}
                                    />
                                    <Button size="sm" onClick={handleBatchAllocate} disabled={loading || selectedCompanies.size === 0}>
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Allocate Batch"}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                                    checked={selectedCompanies.size === companies.length && companies.length > 0}
                                                    onChange={toggleAll}
                                                />
                                            </TableHead>
                                            <TableHead>Company Name</TableHead>
                                            <TableHead>Wallet Address</TableHead>
                                            <TableHead>Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {companies.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center">
                                                    No registered companies found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            companies.map((company) => (
                                                <TableRow key={company.walletAddress} data-state={selectedCompanies.has(company.walletAddress) ? "selected" : undefined}>
                                                    <TableCell>
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                                                            checked={selectedCompanies.has(company.walletAddress)}
                                                            onChange={() => toggleCompany(company.walletAddress)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium">{company.companyName}</TableCell>
                                                    <TableCell className="text-muted-foreground">{company.walletAddress}</TableCell>
                                                    <TableCell className="text-muted-foreground">{company.email || "-"}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="mt-4 text-xs text-muted-foreground flex justify-between items-center">
                                <span>{selectedCompanies.size} companies selected.</span>
                                <span>Total Allocation to be distributed: {selectedCompanies.size > 0 && allocateAmount ? (Number(allocateAmount) * selectedCompanies.size).toLocaleString() : "0"} Ton CO2e</span>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {shellTab === "verification" && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Verifications</CardTitle>
                            <CardDescription>Review and validate MRV reports submitted by companies.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                <Send className="h-10 w-10 mb-4 opacity-20" />
                                <p>No pending reports found.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardShell>
    )
}
