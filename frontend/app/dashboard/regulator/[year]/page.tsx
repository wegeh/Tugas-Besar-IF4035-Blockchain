'use client'

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { getUnallocatedCompanies, getAllocatedCompanies, recordAllocation } from "@/app/actions/allocation"
import { getPeriodTokenAddress, endPeriod, getCompliancePeriods } from "@/app/actions/period-actions"
import { useContracts } from "@/lib/use-contracts"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { forwarderAddress, getPtbaeContract, DEBUG_FACTORY_ADDRESS } from "@/lib/contracts"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Loader2, ArrowLeft, CheckCircle2, LayoutDashboard, FileText, Send, Ban } from "lucide-react"
import Link from "next/link"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function PeriodDetailPage() {
    const params = useParams()
    const year = Number(params.year)
    const { isReady, getSigner } = useContracts()

    // Shell State
    const [activeTab, setActiveTab] = useState("allocation")
    const menuItems = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "allocation", label: "Allocation", icon: FileText },
        { id: "verification", label: "Verification", icon: Send },
    ]

    // Data State
    const [tokenAddress, setTokenAddress] = useState<string>("")
    const [isActive, setIsActive] = useState(true)
    const [unallocated, setUnallocated] = useState<any[]>([])
    const [allocated, setAllocated] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)

    // Action State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [amount, setAmount] = useState("")
    const [processing, setProcessing] = useState(false)
    const [endingPeriod, setEndingPeriod] = useState(false)

    useEffect(() => {
        loadData()
    }, [year, refreshKey])

    async function loadData() {
        setLoading(true)
        try {
            // Fetch period details alongside allocation data
            // We can reuse getCompliancePeriods and find current year, or assuming we need a specific 'getPeriod(year)'
            // For now, let's filter from list to avoid creating new query if list is small.
            const allPeriods = await getCompliancePeriods()
            const currentPeriod = allPeriods.find(p => p.year === year)

            const [unallocData, allocData, addr] = await Promise.all([
                getUnallocatedCompanies(year),
                getAllocatedCompanies(year),
                getPeriodTokenAddress(year)
            ])
            setUnallocated(unallocData)
            setAllocated(allocData)
            setTokenAddress(addr || "")
            if (currentPeriod) setIsActive(currentPeriod.isActive)

        } catch (error) {
            console.error(error)
            toast.error("Failed to load period data")
        } finally {
            setLoading(false)
        }
    }

    // Checkbox Logic
    const toggleCompany = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    const toggleAll = () => {
        if (selectedIds.size === unallocated.length) setSelectedIds(new Set())
        else setSelectedIds(new Set(unallocated.map(c => c.id)))
    }

    // Handlers
    async function handleEndPeriod() {
        if (!tokenAddress) return
        setEndingPeriod(true)
        try {
            const signer = await getSigner()

            // 1. Get Contract Instance
            const contract = getPtbaeContract(signer, tokenAddress)

            // 2. Prepare Meta-Tx Data for endPeriod()
            // endPeriod() takes no arguments
            const data = contract.interface.encodeFunctionData("endPeriod", [])

            toast.info("Signing 'End Period' request...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data)

            toast.info("Relaying transaction...")
            const txResult = await sendMetaTx(request, signature)
            toast.success("End Period Transaction Relayed! Hash: " + txResult.txHash)

            // Wait for tx confirmation
            const provider = signer.provider
            if (provider) await provider.waitForTransaction(txResult.txHash)

            // 3. Update DB
            await endPeriod(year)

            toast.success("Period Ended successfully")
            setIsActive(false)
        } catch (error: any) {
            console.error("End Period Error:", error)
            const msg = error.message.toLowerCase()
            if (msg.includes("period ended") || msg.includes("already ended")) {
                toast.error("This period is already ended.")
            } else {
                toast.error("Failed to end period. Please check usage or try again.")
            }
        } finally {
            setEndingPeriod(false)
        }
    }

    async function handleAllocate() {
        if (!amount || selectedIds.size === 0) {
            toast.error("Please select companies and enter an amount")
            return
        }
        if (!tokenAddress) {
            toast.error("Token address not found for this period")
            return
        }

        setProcessing(true)
        try {
            const signer = await getSigner()

            // 1. Get Contract Instance
            const contract = getPtbaeContract(signer, tokenAddress)

            // 2. Prepare Data
            const selectedCompanies = unallocated.filter(c => selectedIds.has(c.id))
            const addresses = selectedCompanies.map(c => c.walletAddress)
            const amountWei = BigInt(amount) * BigInt(10 ** 18)

            // 3. Encode & Sign
            const data = contract.interface.encodeFunctionData("batchAllocate", [addresses, amountWei])

            toast.info("Signing request...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data)

            // 4. Send to Relayer
            toast.info("Sending to Relayer...")
            const txResult = await sendMetaTx(request, signature)

            // 5. Record in DB
            await recordAllocation(year, addresses, amount, txResult.txHash)

            toast.success("Allocation Successful!")
            setRefreshKey(p => p + 1)
            setSelectedIds(new Set())
            setAmount("")

        } catch (error: any) {
            console.error("Allocation Error:", error)
            const msg = error.message.toLowerCase()

            if (msg.includes("period ended")) {
                toast.error("Allocation failed: The period has ended.")
            } else if (msg.includes("user rejected") || msg.includes("rejected transaction")) {
                toast.error("Transaction rejected by user.")
            } else {
                toast.error("Allocation failed. Please try again.")
            }
        } finally {
            setProcessing(false)
        }
    }

    return (
        <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab} menuItems={menuItems}>
            <div className="container mx-auto py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Link href="/dashboard/regulator">
                            <Button variant="ghost" size="icon"><ArrowLeft className="h-6 w-6" /></Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-3xl font-bold tracking-tight">Period {year}</h2>
                                {!isActive && <Badge variant="destructive">Ended</Badge>}
                                {isActive && <Badge variant="default" className="bg-green-600">Active</Badge>}
                            </div>
                            <p className="text-muted-foreground font-mono text-sm mt-1">{tokenAddress || "Loading Address..."}</p>
                        </div>
                    </div>

                    {isActive && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Ban className="mr-2 h-4 w-4" /> End Period
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Ending the period will prevent further allocations in the interface.
                                        You can still interact with the smart contract directly if needed.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleEndPeriod} className="bg-red-600 hover:bg-red-700">
                                        {endingPeriod && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        End Period
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>

                <Tabs defaultValue="pending">
                    <TabsList>
                        <TabsTrigger value="pending">Pending Allocation ({unallocated.length})</TabsTrigger>
                        <TabsTrigger value="allocated">Allocated History ({allocated.length})</TabsTrigger>
                    </TabsList>

                    {/* Pending Tab */}
                    <TabsContent value="pending" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle>Unallocated Companies</CardTitle>
                                <div className="flex items-center space-x-2">
                                    <Input
                                        placeholder="Amount (Ton CO2e)"
                                        type="number"
                                        className="w-40"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        disabled={!isActive}
                                    />
                                    <Button onClick={handleAllocate} disabled={processing || selectedIds.size === 0 || !isActive}>
                                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                        Allocate Batch
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">
                                                <input type="checkbox" onChange={toggleAll} checked={selectedIds.size === unallocated.length && unallocated.length > 0} disabled={!isActive} />
                                            </TableHead>
                                            <TableHead>Company</TableHead>
                                            <TableHead>Wallet</TableHead>
                                            <TableHead>Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? <TableRow><TableCell colSpan={4}>Loading...</TableCell></TableRow> :
                                            unallocated.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8">All companies allocated!</TableCell></TableRow> :
                                                unallocated.map(c => (
                                                    <TableRow key={c.id}>
                                                        <TableCell>
                                                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleCompany(c.id)} disabled={!isActive} />
                                                        </TableCell>
                                                        <TableCell className="font-medium">{c.companyName}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="font-normal text-xs">{c.walletAddress}</Badge>
                                                        </TableCell>
                                                        <TableCell>{c.email}</TableCell>
                                                    </TableRow>
                                                ))
                                        }
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Allocated Tab */}
                    <TabsContent value="allocated">
                        <Card>
                            <CardHeader>
                                <CardTitle>Allocation History</CardTitle>
                                <CardDescription>Records of issued carbon allowances.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Company</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Tx Hash</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allocated.map(a => (
                                            <TableRow key={a.id}>
                                                <TableCell className="font-medium">{a.company.companyName}</TableCell>
                                                <TableCell><Badge variant="secondary">{a.amount} Ton</Badge></TableCell>
                                                <TableCell className="font-mono text-xs text-blue-600 truncate max-w-[150px]">{a.txHash}</TableCell>
                                                <TableCell>{new Date(a.createdAt).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                        {allocated.length === 0 && !loading && (
                                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No history yet.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardShell>
    )
}
