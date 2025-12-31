'use client'

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { getUnallocatedCompanies, getAllocatedCompanies, recordAllocation } from "@/app/actions/allocation"
import { getPeriodTokenAddress, updatePeriodStatus, getCompliancePeriods } from "@/app/actions/period-actions"
import { useContracts } from "@/lib/use-contracts"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { forwarderAddress, getPtbaeContract, PeriodStatus } from "@/lib/contracts"
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
import { Loader2, ArrowLeft, CheckCircle2, Lock, ShieldCheck } from "lucide-react"
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

export default function AllocationManagementPage() {
    const params = useParams()
    const year = Number(params.year)
    const { getSigner } = useContracts()

    // Data State
    const [tokenAddress, setTokenAddress] = useState<string>("")
    const [status, setStatus] = useState<PeriodStatus>(PeriodStatus.ACTIVE)
    const [unallocated, setUnallocated] = useState<any[]>([])
    const [allocated, setAllocated] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)

    // Action State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [amount, setAmount] = useState("")
    const [processing, setProcessing] = useState(false)
    const [lifecycleLoading, setLifecycleLoading] = useState(false)

    useEffect(() => {
        loadData()
    }, [year, refreshKey])

    async function loadData() {
        setLoading(true)
        try {
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

            if (currentPeriod) {
                switch (currentPeriod.status) {
                    case "ACTIVE": setStatus(PeriodStatus.ACTIVE); break;
                    case "AUDIT": setStatus(PeriodStatus.AUDIT); break;
                    case "ENDED": setStatus(PeriodStatus.ENDED); break;
                    default: setStatus(PeriodStatus.ACTIVE);
                }
            }
        } catch (error) {
            console.error(error)
            toast.error("Failed to load period data")
        } finally {
            setLoading(false)
        }
    }

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

    async function handleSetAudit() {
        if (!tokenAddress) return
        setLifecycleLoading(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer, tokenAddress)
            const currentStatus = await contract.status()

            if (Number(currentStatus) !== 1) {
                const data = contract.interface.encodeFunctionData("setAudit", [])
                toast.info("Signing 'Start Audit' request...")
                const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data)
                toast.info("Relaying transaction...")
                const txResult = await sendMetaTx(request, signature)
                console.log("[Audit] Tx Hash:", txResult.txHash)
            }

            // Update DB status
            console.log("[Audit] Updating period status in database...")
            await updatePeriodStatus(year, "AUDIT")
            console.log("[Audit] Database updated successfully")

            toast.success("Period is now in Audit Mode")
            setStatus(PeriodStatus.AUDIT)
        } catch (error: any) {
            console.error("Set Audit Error:", error)
            toast.error("Failed to start audit phase: " + (error.message || "Unknown error"))
        } finally {
            setLifecycleLoading(false)
        }
    }

    async function handleFinalize() {
        if (!tokenAddress) return
        setLifecycleLoading(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer, tokenAddress)
            const data = contract.interface.encodeFunctionData("finalize", [])

            toast.info("Signing 'Finalize' request...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data)
            toast.info("Relaying transaction...")
            const txResult = await sendMetaTx(request, signature)
            console.log("[Finalize] Tx Hash:", txResult.txHash)

            // Update DB status
            console.log("[Finalize] Updating period status in database...")
            await updatePeriodStatus(year, "ENDED")
            console.log("[Finalize] Database updated successfully")

            // AUTOMATICALLY CREATE MARKET
            console.log("[Finalize] Opening Trading Market...")
            const marketRes = await fetch("/api/markets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    marketType: "PTBAE",
                    periodYear: year,
                    tokenId: tokenAddress, // Using tokenAddress as tokenId
                    // Set default to 10,000 IDRC (10,000 * 10^18)
                    basePrice: "10000000000000000000000"
                })
            })

            if (!marketRes.ok) {
                const err = await marketRes.json()
                console.error("Failed to create market:", err)
                toast.warning("Period Finalized, but failed to auto-open Market: " + err.error)
            } else {
                toast.success("Period Finalized & Market Opened!")
            }

            setStatus(PeriodStatus.ENDED)
        } catch (error: any) {
            console.error("Finalize Error:", error)
            toast.error("Failed to finalize period: " + (error.message || "Unknown error"))
        } finally {
            setLifecycleLoading(false)
        }
    }

    async function handleAllocate() {
        if (!amount || selectedIds.size === 0) {
            toast.error("Please select companies and enter an amount")
            return
        }
        if (status !== PeriodStatus.ACTIVE) {
            toast.error("Allocations are only allowed in ACTIVE period")
            return
        }

        setProcessing(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer, tokenAddress)
            const selectedCompanies = unallocated.filter(c => selectedIds.has(c.id))
            const addresses = selectedCompanies.map(c => c.walletAddress)
            const amountWei = BigInt(amount) * BigInt(10 ** 18)
            const data = contract.interface.encodeFunctionData("batchAllocate", [addresses, amountWei])

            toast.info("Signing request...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data)
            toast.info("Sending to Relayer...")
            const txResult = await sendMetaTx(request, signature)

            await recordAllocation(year, addresses, amount, txResult.txHash)

            toast.success("Allocation Successful!")
            setRefreshKey(p => p + 1)
            setSelectedIds(new Set())
            setAmount("")
        } catch (error: any) {
            console.error("Allocation Error:", error)
            toast.error("Allocation failed: " + error.message)
        } finally {
            setProcessing(false)
        }
    }

    const isActive = status === PeriodStatus.ACTIVE
    const isAudit = status === PeriodStatus.AUDIT
    const isEnded = status === PeriodStatus.ENDED

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/dashboard/regulator">
                        <Button variant="ghost" size="icon"><ArrowLeft className="h-6 w-6" /></Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-bold tracking-tight">Period {year} - Allocations</h1>
                            {isActive && <Badge className="bg-green-600">Active</Badge>}
                            {isAudit && <Badge className="bg-yellow-600">Audit Phase</Badge>}
                            {isEnded && <Badge variant="destructive">Finalized</Badge>}
                        </div>
                        <p className="text-muted-foreground font-mono text-sm mt-1">{tokenAddress || "Loading..."}</p>
                    </div>
                </div>

                <div className="flex space-x-2">
                    {isActive && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-50">
                                    <ShieldCheck className="mr-2 h-4 w-4" /> Start Audit Phase
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Start Audit Phase?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will DISABLE transfers/trading but ALLOW surrendering.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleSetAudit} className="bg-yellow-600 hover:bg-yellow-700">
                                        {lifecycleLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Start Audit
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    {(isActive || isAudit) && !isEnded && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Lock className="mr-2 h-4 w-4" /> Finalize Period
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Finalize Period?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will completely FREEZE the period. No more surrenders or transfers allowed.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleFinalize} className="bg-red-600 hover:bg-red-700">
                                        {lifecycleLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Finalize
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
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
    )
}
