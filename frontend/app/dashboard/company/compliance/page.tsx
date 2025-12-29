"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Loader2, CheckCircle, Clock, Info, AlertTriangle, History } from "lucide-react"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { getPtbaeContract, getSigner, forwarderAddress, getPTBAEBalanceForPeriod, getComplianceInfo, ComplianceStatus, type ComplianceInfo } from "@/lib/contracts"
import { getCompliancePeriods } from "@/app/actions/period-actions"
import { formatUnits } from "ethers"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

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

export default function CompliancePage() {
    const { address } = useAccount()
    const [periodAllocations, setPeriodAllocations] = useState<PeriodAllocation[]>([])
    const [complianceInfo, setComplianceInfo] = useState<Map<number, PeriodCompliance>>(new Map())
    const [loading, setLoading] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

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

            } catch (error) {
                console.error("Error fetching data:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [address, refreshKey])

    const handleSurrender = async (periodYear: number) => {
        const period = periodAllocations.find(p => p.year === periodYear)
        if (!period) {
            toast.error("Invalid period")
            return
        }

        if (period.status !== "AUDIT") {
            toast.error("Surrender hanya bisa dilakukan saat Audit Phase.")
            return
        }

        const info = complianceInfo.get(periodYear)
        if (!info || Number(info.verifiedEmission) === 0) {
            toast.error("Belum ada tagihan dari Regulator untuk periode ini.")
            return
        }

        setLoading(true)
        try {
            const signer = await getSigner()
            const contract = getPtbaeContract(signer, period.tokenAddress)

            const data = contract.interface.encodeFunctionData("surrender", [])
            const to = await contract.getAddress()

            toast.info("Signing Request", { description: `Membayar tagihan ${info.verifiedEmission} Ton...` })
            const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)

            toast.info("Processing", { description: "Mengirim transaksi..." })
            const result = await sendMetaTx(request, signature)

            toast.success("Sukses!", { description: `Tagihan ${info.verifiedEmission} Ton terbayar. Tx: ${result.txHash.slice(0, 10)}...` })
            setRefreshKey(p => p + 1)
        } catch (error: any) {
            console.error("Surrender Error:", error)
            const msg = error.message?.toLowerCase() || ""
            if (msg.includes("rejected")) {
                toast.error("Transaksi dibatalkan.")
            } else if (msg.includes("insufficient balance")) {
                toast.error("Saldo PTBAE tidak cukup untuk membayar tagihan.")
            } else if (msg.includes("already surrendered")) {
                toast.error("Anda sudah membayar tagihan periode ini.")
            } else if (msg.includes("no verified emission")) {
                toast.error("Belum ada tagihan dari Regulator.")
            } else {
                toast.error("Gagal: " + error.message)
            }
        } finally {
            setLoading(false)
        }
    }

    // Filter periods with surrender history
    const surrenderHistory = Array.from(complianceInfo.entries())
        .filter(([_, info]) => Number(info.surrendered) > 0)
        .sort(([yearA], [yearB]) => yearB - yearA)

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
                                    <div className="grid gap-4 md:grid-cols-4">
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
                                    </div>

                                    {/* Action Buttons */}
                                    {info && Number(info.verifiedEmission) > 0 && period.status === 'AUDIT' && info.status !== ComplianceStatus.COMPLIANT && (
                                        <Button
                                            onClick={() => handleSurrender(period.year)}
                                            disabled={loading}
                                            variant="destructive"
                                            className="w-full"
                                        >
                                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Bayar Tagihan {info.verifiedEmission} Ton
                                        </Button>
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
                                    <TableHead>Verified Emission</TableHead>
                                    <TableHead>Amount Paid</TableHead>
                                    <TableHead>Remaining Debt</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {surrenderHistory.map(([year, info]) => (
                                    <TableRow key={year}>
                                        <TableCell className="font-medium">{year}</TableCell>
                                        <TableCell>{info.verifiedEmission} Ton</TableCell>
                                        <TableCell className="text-green-600 font-semibold">{info.surrendered} Ton</TableCell>
                                        <TableCell className={Number(info.debt) > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                                            {info.debt} Ton
                                        </TableCell>
                                        <TableCell>
                                            {info.status === ComplianceStatus.COMPLIANT ? (
                                                <Badge className="bg-green-600">
                                                    <CheckCircle className="h-3 w-3 mr-1" /> COMPLIANT
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-yellow-600">
                                                    <Clock className="h-3 w-3 mr-1" /> PENDING
                                                </Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}


        </div>
    )
}
