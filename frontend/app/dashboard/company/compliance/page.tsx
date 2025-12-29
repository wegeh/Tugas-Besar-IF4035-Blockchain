"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Loader2, CheckCircle, Clock, Info, AlertTriangle, History, Leaf } from "lucide-react"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { getPtbaeContract, getSigner, forwarderAddress, getPTBAEBalanceForPeriod, getComplianceInfo, ComplianceStatus, type ComplianceInfo, getTotalSPEBalance, checkSPEApproval, getSpeContract } from "@/lib/contracts"
import { getCompliancePeriods } from "@/app/actions/period-actions"
import { formatUnits, parseUnits } from "ethers"
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
} from "@/components/ui/dialog"

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

interface PeriodCompliance {
    year: number
    verifiedEmission: string
    surrendered: string
    debt: string
    status: ComplianceStatus
}

interface SPEToken {
    tokenId: string
    balance: string
    selected: boolean
    amountToUse: string
}

export default function CompliancePage() {
    const { address } = useAccount()
    const [periodAllocations, setPeriodAllocations] = useState<PeriodAllocation[]>([])
    const [complianceInfo, setComplianceInfo] = useState<Map<number, PeriodCompliance>>(new Map())
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    // SPE Offsetting State
    const [speTokens, setSpeTokens] = useState<SPEToken[]>([])
    const [totalSpeBalance, setTotalSpeBalance] = useState<string>("0") // Total SPE balance in wei
    const [showOffsetDialog, setShowOffsetDialog] = useState(false)
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodAllocation | null>(null)
    const [offsetLoading, setOffsetLoading] = useState(false)

    // Fetch All Data
    useEffect(() => {
        async function fetchData() {
            if (!address) return
            setLoading(true)
            try {
                // 1. Get Periods & Balances
                const periods = await getCompliancePeriods()
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

                // 2. Get Compliance Info
                const infoMap = new Map<number, PeriodCompliance>()
                for (const period of allocations) {
                    const info = await getComplianceInfo(period.year, address)
                    if (info) {
                        infoMap.set(period.year, {
                            year: period.year,
                            verifiedEmission: (BigInt(info.verifiedEmission) / BigInt(10 ** 18)).toString(),
                            surrendered: (BigInt(info.surrendered) / BigInt(10 ** 18)).toString(),
                            debt: (BigInt(info.debt) / BigInt(10 ** 18)).toString(),
                            status: info.status
                        })
                    }
                }
                setComplianceInfo(infoMap)

                // 3. Fetch SPE Tokens
                const speData = await getTotalSPEBalance(address)
                setTotalSpeBalance(speData.total)
                const tokens: SPEToken[] = speData.tokens.map(t => ({
                    tokenId: t.tokenId,
                    balance: t.balance,
                    selected: false,
                    amountToUse: "0"
                }))
                setSpeTokens(tokens)

            } catch (error) {
                console.error("Error fetching data:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [address, refreshKey])

    // Open Offset Dialog
    const openOffsetDialog = (period: PeriodAllocation) => {
        setSelectedPeriod(period)
        // Reset SPE token selections
        setSpeTokens(prev => prev.map(t => ({ ...t, selected: false, amountToUse: "0" })))
        setShowOffsetDialog(true)
    }

    // Toggle SPE token selection
    const toggleSPEToken = (tokenId: string) => {
        setSpeTokens(prev => prev.map(t => {
            if (t.tokenId === tokenId) {
                const newSelected = !t.selected
                return {
                    ...t,
                    selected: newSelected,
                    amountToUse: newSelected ? formatUnits(t.balance, 18) : "0"
                }
            }
            return t
        }))
    }

    // Update SPE amount to use
    const updateSPEAmount = (tokenId: string, amount: string) => {
        setSpeTokens(prev => prev.map(t =>
            t.tokenId === tokenId ? { ...t, amountToUse: amount } : t
        ))
    }

    // Calculate total offset from selected SPE tokens
    const calculateTotalOffset = (): bigint => {
        return speTokens
            .filter(t => t.selected && parseFloat(t.amountToUse) > 0)
            .reduce((sum, t) => {
                try {
                    return sum + parseUnits(t.amountToUse, 18)
                } catch {
                    return sum
                }
            }, BigInt(0))
    }

    // Handle Surrender with Offset
    const handleSurrenderWithOffset = async () => {
        if (!selectedPeriod || !address) return

        const info = complianceInfo.get(selectedPeriod.year)
        if (!info) {
            toast.error("Tidak ada data compliance")
            return
        }

        setOffsetLoading(true)
        try {
            const signer = await getSigner()
            const ptbaeContract = getPtbaeContract(signer, selectedPeriod.tokenAddress)
            const speContract = getSpeContract(signer)
            const ptbaeAddress = await ptbaeContract.getAddress()

            // Prepare SPE token arrays
            const selectedSPE = speTokens.filter(t => t.selected && parseFloat(t.amountToUse) > 0)
            const speIds = selectedSPE.map(t => BigInt(t.tokenId))
            const speAmounts = selectedSPE.map(t => parseUnits(t.amountToUse, 18))

            // If using SPE offset, check and request approval first
            if (speIds.length > 0) {
                // Check if PTBAEAllowanceToken is approved to transfer user's SPE tokens
                const isApproved = await checkSPEApproval(address, ptbaeAddress)

                if (!isApproved) {
                    toast.info("Meminta approval SPE...", { description: "Anda perlu menyetujui transfer SPE token" })

                    // Request approval via MetaTx
                    const approvalData = speContract.interface.encodeFunctionData("setApprovalForAll", [ptbaeAddress, true])
                    const speAddr = await speContract.getAddress()

                    const { request: approvalReq, signature: approvalSig } = await createMetaTx(
                        signer, forwarderAddress, speAddr, approvalData
                    )

                    toast.info("Processing Approval...", { description: "Mengirim transaksi approval..." })
                    const approvalResult = await sendMetaTx(approvalReq, approvalSig)

                    // Wait for approval tx to be fully mined and propagated
                    toast.info("Menunggu konfirmasi approval...", { description: "Hash: " + approvalResult.txHash.slice(0, 10) + "..." })
                    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s for nonce to update

                    toast.success("Approval Berhasil!")
                }
            }

            // Now proceed with surrender
            let data: string
            let description: string

            if (speIds.length > 0) {
                // Use surrenderWithOffset
                data = ptbaeContract.interface.encodeFunctionData("surrenderWithOffset", [speIds, speAmounts])
                const totalOffset = formatUnits(calculateTotalOffset(), 18)
                description = `Offset ${totalOffset} Ton dengan SPE, sisa dengan PTBAE...`
            } else {
                // Use regular surrender
                data = ptbaeContract.interface.encodeFunctionData("surrender", [])
                description = `Membayar tagihan ${info.verifiedEmission} Ton dengan PTBAE...`
            }

            const to = await ptbaeContract.getAddress()

            toast.info("Signing Surrender Request", { description })
            const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)

            toast.info("Processing", { description: "Mengirim transaksi surrender..." })
            const result = await sendMetaTx(request, signature)

            toast.success("Sukses!", {
                description: `Tagihan terbayar. Tx: ${result.txHash.slice(0, 10)}...`
            })

            setShowOffsetDialog(false)
            setRefreshKey(p => p + 1)
        } catch (error: any) {
            console.error("Surrender Error:", error)
            const msg = error.message?.toLowerCase() || ""
            if (msg.includes("rejected")) {
                toast.error("Transaksi dibatalkan.")
            } else if (msg.includes("insufficient")) {
                toast.error("Saldo tidak cukup untuk membayar tagihan.")
            } else if (msg.includes("already surrendered")) {
                toast.error("Anda sudah membayar tagihan periode ini.")
            } else if (msg.includes("vintage")) {
                toast.error("SPE token vintage year tidak valid untuk periode ini.")
            } else {
                toast.error("Gagal: " + error.message)
            }
        } finally {
            setOffsetLoading(false)
        }
    }

    // Filter periods with surrender history
    const surrenderHistory = Array.from(complianceInfo.entries())
        .filter(([_, info]) => Number(info.surrendered) > 0)
        .sort(([yearA], [yearB]) => yearB - yearA)

    // Calculate remaining debt after offset
    const getRemainingDebt = (): string => {
        if (!selectedPeriod) return "0"
        const info = complianceInfo.get(selectedPeriod.year)
        if (!info) return "0"

        const tagihan = parseUnits(info.verifiedEmission, 18)
        const offset = calculateTotalOffset()
        const remaining = tagihan > offset ? tagihan - offset : BigInt(0)
        return formatUnits(remaining, 18)
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Compliance Status</h1>
                <p className="text-muted-foreground">
                    View your verified emissions and surrender status per period.
                </p>
            </div>

            {loading && periodAllocations.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : periodAllocations.length === 0 ? (
                <p className="text-muted-foreground">No compliance data available.</p>
            ) : (
                <div className="grid gap-4">
                    {periodAllocations.map((period) => {
                        const info = complianceInfo.get(period.year)
                        const hasSPETokens = speTokens.length > 0

                        return (
                            <Card key={period.year}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Period {period.year}</CardTitle>
                                        {info?.status === ComplianceStatus.COMPLIANT && (
                                            <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> COMPLIANT</Badge>
                                        )}
                                        {info?.status === ComplianceStatus.PENDING && (
                                            <Badge className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" /> PENDING</Badge>
                                        )}
                                        {(!info || info?.status === ComplianceStatus.NO_DATA) && (
                                            <Badge variant="secondary"><Info className="h-3 w-3 mr-1" /> NO DATA</Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-5">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Verified Emission</p>
                                            <p className="text-xl font-bold">{info?.verifiedEmission || '0'} Ton</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Surrendered</p>
                                            <p className="text-xl font-bold text-green-600">{info?.surrendered || '0'} Ton</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Remaining Debt</p>
                                            <p className="text-xl font-bold text-red-600">{info?.debt || '0'} Ton</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">PTBAE Balance</p>
                                            <p className="text-xl font-bold">{formatTon(period.balance)} Ton</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">SPE-GRK Balance</p>
                                            <p className="text-xl font-bold text-green-600">{formatTon(totalSpeBalance)} Ton</p>
                                        </div>
                                    </div>

                                    {/* SPE Balance Info */}
                                    {hasSPETokens && period.status === 'AUDIT' && info?.status !== ComplianceStatus.COMPLIANT && (
                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2">
                                            <Leaf className="h-5 w-5 text-green-600" />
                                            <p className="text-sm text-green-700 dark:text-green-400">
                                                Anda memiliki <strong>{formatTon(totalSpeBalance)} Ton SPE-GRK</strong> ({speTokens.length} jenis token) yang dapat digunakan untuk offset.
                                            </p>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    {info && Number(info.verifiedEmission) > 0 && period.status === 'AUDIT' && info.status !== ComplianceStatus.COMPLIANT && (
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={() => openOffsetDialog(period)}
                                                disabled={loading}
                                                className="flex-1 bg-green-600 hover:bg-green-700"
                                            >
                                                <Leaf className="mr-2 h-4 w-4" />
                                                Bayar dengan SPE + PTBAE
                                            </Button>
                                        </div>
                                    )}

                                    {info && Number(info.debt) > 0 && period.status === 'AUDIT' && (
                                        <Alert variant="destructive">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle>Tagihan Belum Lunas</AlertTitle>
                                            <AlertDescription>
                                                Anda harus membayar {info.verifiedEmission} Ton untuk memenuhi kepatuhan.
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {info?.status === ComplianceStatus.COMPLIANT && (
                                        <Alert className="bg-green-50 border-green-200">
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                            <AlertTitle className="text-green-800">Tagihan Lunas</AlertTitle>
                                            <AlertDescription className="text-green-700">
                                                Anda sudah memenuhi kewajiban untuk periode ini.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Surrender History */}
            {surrenderHistory.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            <CardTitle>Surrender History</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Emission</TableHead>
                                    <TableHead>Surrendered</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {surrenderHistory.map(([year, info]) => (
                                    <TableRow key={year}>
                                        <TableCell className="font-medium">{year}</TableCell>
                                        <TableCell>{info.verifiedEmission} Ton</TableCell>
                                        <TableCell className="text-green-600">{info.surrendered} Ton</TableCell>
                                        <TableCell>
                                            <Badge className="bg-green-600">COMPLIANT</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* SPE Offset Dialog */}
            <Dialog open={showOffsetDialog} onOpenChange={setShowOffsetDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Bayar Tagihan - Period {selectedPeriod?.year}</DialogTitle>
                        <DialogDescription>
                            Gunakan SPE-GRK token untuk offset, sisa tagihan akan dibayar dengan PTBAE.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                            <div>
                                <p className="text-sm text-muted-foreground">Tagihan</p>
                                <p className="text-lg font-bold">
                                    {complianceInfo.get(selectedPeriod?.year || 0)?.verifiedEmission || '0'} Ton
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">SPE Offset</p>
                                <p className="text-lg font-bold text-green-600">
                                    {formatUnits(calculateTotalOffset(), 18)} Ton
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Bayar PTBAE</p>
                                <p className="text-lg font-bold text-orange-600">
                                    {getRemainingDebt()} Ton
                                </p>
                            </div>
                        </div>

                        {/* SPE Token Selection */}
                        {speTokens.length > 0 ? (
                            <div className="space-y-2">
                                <Label>Pilih SPE Token untuk Offset</Label>
                                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                                    {speTokens.map(token => (
                                        <div key={token.tokenId} className="p-3 flex items-center gap-4">
                                            <Checkbox
                                                checked={token.selected}
                                                onCheckedChange={() => toggleSPEToken(token.tokenId)}
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">Token #{token.tokenId.slice(0, 10)}...</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Balance: {formatUnits(token.balance, 18)} Ton
                                                </p>
                                            </div>
                                            {token.selected && (
                                                <div className="w-32">
                                                    <Input
                                                        type="number"
                                                        value={token.amountToUse}
                                                        onChange={(e) => updateSPEAmount(token.tokenId, e.target.value)}
                                                        max={formatUnits(token.balance, 18)}
                                                        min="0"
                                                        step="0.01"
                                                        className="h-8 text-sm"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Tidak ada SPE Token</AlertTitle>
                                <AlertDescription>
                                    Anda tidak memiliki SPE-GRK token. Tagihan akan dibayar sepenuhnya dengan PTBAE.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowOffsetDialog(false)}>
                            Batal
                        </Button>
                        <Button
                            onClick={handleSurrenderWithOffset}
                            disabled={offsetLoading}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {offsetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Bayar Tagihan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
