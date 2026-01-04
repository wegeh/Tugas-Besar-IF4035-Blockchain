'use client'

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { getComplianceInfo, ComplianceStatus } from "@/lib/contracts"
import { Loader2 } from "lucide-react"
import { useCompliancePeriods, useAllocations } from "@/hooks"

export default function VerificationPage() {
    const { data: periods = [] } = useCompliancePeriods()
    const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null)
    const { data: allocations = [], isLoading: allocLoading } = useAllocations(selectedPeriod || 0)
    const [complianceData, setComplianceData] = useState<Map<string, { emission: string, surrendered: string, status: ComplianceStatus }>>(new Map())
    const [loading, setLoading] = useState(true)

    // Auto-select first AUDIT/ENDED period
    useEffect(() => {
        if (periods.length > 0 && !selectedPeriod) {
            const auditPeriod = periods.find(p => p.status === 'AUDIT' || p.status === 'ENDED')
            setSelectedPeriod(auditPeriod?.year || periods[0].year)
        }
    }, [periods, selectedPeriod])

    // Load compliance data when allocations change
    useEffect(() => {
        if (allocations.length > 0 && selectedPeriod) {
            loadComplianceData()
        }
    }, [allocations, selectedPeriod])

    async function loadComplianceData() {
        if (!selectedPeriod) return
        setLoading(true)
        try {
            const data = new Map<string, { emission: string, surrendered: string, status: ComplianceStatus }>()
            for (const alloc of allocations) {
                try {
                    const info = await getComplianceInfo(selectedPeriod, alloc.company.walletAddress)
                    if (info) {
                        data.set(alloc.company.walletAddress.toLowerCase(), {
                            emission: (BigInt(info.verifiedEmission) / BigInt(10 ** 18)).toString(),
                            surrendered: (BigInt(info.surrendered) / BigInt(10 ** 18)).toString(),
                            status: info.status
                        })
                    }
                } catch (e) {
                    console.error(`Error loading compliance for ${alloc.company.walletAddress}:`, e)
                }
            }
            setComplianceData(data)
        } catch (error) {
            console.error("Failed to load compliance data:", error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">MRV Verification Status</h1>
                <p className="text-muted-foreground">
                    View company compliance status for verified emissions
                </p>
            </div>

            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4">
                    <p className="text-sm text-blue-800">
                        <strong>ℹ️ Info:</strong> Verified emissions are set by the <strong>Oracle Service</strong> (external).<br />
                        Companies submit reports via their dashboard → Oracle verifies → Emissions automatically set on-chain.
                    </p>
                </CardContent>
            </Card>

            {/* Period Selector */}
            <div className="flex items-center gap-4">
                <label className="font-medium">Select Period:</label>
                <select
                    value={selectedPeriod || ""}
                    onChange={(e) => setSelectedPeriod(Number(e.target.value))}
                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                    <option value="">-- Select Period --</option>
                    {periods.map(p => (
                        <option key={p.year} value={p.year}>
                            {p.year} ({p.status})
                        </option>
                    ))}
                </select>
            </div>

            {/* Compliance Status Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Company Compliance Status - Period {selectedPeriod}</CardTitle>
                    <CardDescription>
                        Data updated automatically by Oracle after company submission verification.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="ml-2">Loading compliance data...</span>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Wallet</TableHead>
                                    <TableHead>Verified Emission</TableHead>
                                    <TableHead>Surrendered</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allocations.map(a => {
                                    const compliance = complianceData.get(a.company.walletAddress.toLowerCase())
                                    return (
                                        <TableRow key={a.id}>
                                            <TableCell className="font-medium">{a.company.companyName}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-mono text-xs">
                                                    {a.company.walletAddress.slice(0, 10)}...
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{compliance?.emission || '0'} Ton</TableCell>
                                            <TableCell>{compliance?.surrendered || '0'} Ton</TableCell>
                                            <TableCell>
                                                {compliance?.status === ComplianceStatus.COMPLIANT && (
                                                    <Badge className="bg-green-600">COMPLIANT</Badge>
                                                )}
                                                {compliance?.status === ComplianceStatus.PENDING && (
                                                    <Badge className="bg-yellow-600">PENDING</Badge>
                                                )}
                                                {(!compliance || compliance?.status === ComplianceStatus.NO_DATA) && (
                                                    <Badge variant="secondary">NO DATA</Badge>
                                                )}
                                                {compliance?.status === ComplianceStatus.NON_COMPLIANT && (
                                                    <Badge variant="destructive">NON COMPLIANT</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                                {allocations.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                            No companies allocations for this period.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
