'use client'

import { getCompliancePeriods, startNewPeriod } from "@/app/actions/period-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useState, useEffect } from "react"
import { useContracts } from "@/lib/use-contracts"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { forwarderAddress } from "@/lib/contracts"
import { Loader2, Plus, ArrowRight, LayoutDashboard, FileText, Send } from "lucide-react"
import Link from 'next/link'
import { DashboardShell } from "@/components/dashboard-shell"

export default function RegulatorDashboard() {
    // Contract & State
    const { factory, isReady, getSigner } = useContracts()
    const [periods, setPeriods] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Shell State
    const [activeTab, setActiveTab] = useState("allocation")

    const menuItems = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "allocation", label: "Allocation", icon: FileText },
        { id: "verification", label: "Verification", icon: Send },
    ]

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [newPeriodYear, setNewPeriodYear] = useState("")
    const [creatingPeriod, setCreatingPeriod] = useState(false)

    // Initial Load
    useEffect(() => {
        loadPeriods()
    }, [])

    async function loadPeriods() {
        setLoading(true)
        try {
            const data = await getCompliancePeriods()
            setPeriods(data)
        } catch (error) {
            console.error(error)
            toast.error("Failed to load periods")
        } finally {
            setLoading(false)
        }
    }

    // Handlers
    async function handleOpenPeriod() {
        if (!factory) {
            toast.error("Factory contract not ready")
            return
        }
        if (!newPeriodYear || isNaN(Number(newPeriodYear))) {
            toast.error("Invalid year")
            return
        }

        setCreatingPeriod(true)
        try {
            const signer = await getSigner()
            const yearParams = Number(newPeriodYear)

            // METATX: Prepare request
            const factoryAddress = await factory.getAddress()

            // Encode function data for openPeriod(uint32)
            const data = factory.interface.encodeFunctionData("openPeriod", [yearParams])

            toast.info("Signing Request...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, factoryAddress, data)

            toast.info("Sending to Relayer...")
            const txResult = await sendMetaTx(request, signature)
            toast.success("Transaction Relayed! Hash: " + txResult.txHash)

            // Wait for transaction to land
            const provider = signer.provider
            if (provider) {
                await provider.waitForTransaction(txResult.txHash)
            }

            // Sync DB
            const tokenAddr = await factory.tokenByPeriod(yearParams)
            await startNewPeriod(yearParams, tokenAddr)

            toast.success(`Period ${yearParams} started!`)
            setIsDialogOpen(false)
            setNewPeriodYear("")
            loadPeriods()
        } catch (error: any) {
            console.error(error)
            toast.error("Failed to start period: " + (error.message || "Unknown error"))
        } finally {
            setCreatingPeriod(false)
        }
    }

    return (
        <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab} menuItems={menuItems}>
            <div className="container mx-auto py-6 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold tracking-tight">Regulator Dashboard</h2>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> Start New Period
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Start New Compliance Period</DialogTitle>
                                <DialogDescription>
                                    Deploy a new PTBAE Token for the specified year.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="year" className="text-right">
                                        Year
                                    </Label>
                                    <Input
                                        id="year"
                                        type="number"
                                        value={newPeriodYear}
                                        onChange={(e) => setNewPeriodYear(e.target.value)}
                                        className="col-span-3"
                                        placeholder="2025"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={creatingPeriod}>
                                    Cancel
                                </Button>
                                <Button onClick={handleOpenPeriod} disabled={creatingPeriod}>
                                    {creatingPeriod && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Start Period
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Content */}
                <Card>
                    <CardHeader>
                        <CardTitle>Compliance Periods</CardTitle>
                        <CardDescription>Select a period to manage allocations.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Year</TableHead>
                                    <TableHead>Token Address</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-4">Loading periods...</TableCell>
                                    </TableRow>
                                )}
                                {!loading && periods.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No periods found. Start a new one.</TableCell>
                                    </TableRow>
                                )}
                                {periods.map((period) => (
                                    <TableRow key={period.year}>
                                        <TableCell className="font-medium text-lg">{period.year}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{period.tokenAddress}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${period.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {period.isActive ? 'Active' : 'Ended'}
                                            </span>
                                        </TableCell>
                                        <TableCell>{new Date(period.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/dashboard/regulator/${period.year}`}>
                                                <Button variant="secondary" size="sm">
                                                    Manage <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </DashboardShell>
    )
}
