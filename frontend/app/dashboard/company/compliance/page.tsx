"use client"

import { useState, useEffect } from "react"
import { useConnection } from "wagmi"
import { useQueryClient } from "@tanstack/react-query"
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
import { getPtbaeContract, getSigner, forwarderAddress, checkSPEApproval, getSpeContract, getIdrsContract, checkIDRSApproval, ComplianceStatus } from "@/lib/contracts"
import { formatUnits, parseUnits } from "ethers"
// React Query Hooks
import { useComplianceData, useCompliancePeriods, getGrossPeriodObligation } from "@/hooks"
import { useSPETokens } from "@/hooks/use-spe-tokens"
import { useCarbonPrice } from "@/hooks/use-carbon-price"
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
    tokenAddress: string
    verifiedEmission: string
    surrendered: string
    debt: string
    priorDebt: string // Debt from previous period
    status: number
    balance: string
}

interface SPEToken {
    tokenId: string
    balance: string
    selected: boolean
    amountToUse: string
}

interface OlderPeriodPTBAE {
    year: number
    tokenAddress: string
    balance: string
    selected: boolean
    amountToUse: string
}

export default function CompliancePage() {
    const { address } = useConnection()
    const queryClient = useQueryClient()

    // ====== React Query Hooks (Data Fetching) ======
    const { data: periods, isLoading: periodsLoading } = useCompliancePeriods()
    const { data: complianceData, isLoading: complianceLoading, refetch: refetchCompliance } = useComplianceData()
    const { data: speData, isLoading: speLoading } = useSPETokens()
    const { data: carbonPriceData, isLoading: priceLoading } = useCarbonPrice()

    // Derived loading state
    const loading = periodsLoading || complianceLoading || speLoading

    // ====== Local UI State (Dialog, Selections) ======
    const [speTokenSelections, setSpeTokenSelections] = useState<SPEToken[]>([])
    const [showOffsetDialog, setShowOffsetDialog] = useState(false)
    const [selectedPeriodYear, setSelectedPeriodYear] = useState<number | null>(null)
    const [offsetLoading, setOffsetLoading] = useState(false)

    // Older PTBAE Periods State (for cross-period burn)
    const [olderPeriods, setOlderPeriods] = useState<OlderPeriodPTBAE[]>([])
    const [shortage, setShortage] = useState<bigint>(BigInt(0))

    // IDRS State
    const [idrsBalance, setIdrsBalance] = useState<string>("0")
    const [idrsPayAmount, setIdrsPayAmount] = useState<string>("")

    // Prior Debt State (from previous period) - Used in Dialog
    const [priorDebt, setPriorDebt] = useState<bigint>(BigInt(0))

    // ====== Derived State from Hooks (Backward Compatibility) ======
    // These derived values allow existing UI code to work without major changes
    const periodAllocations: PeriodAllocation[] = (periods || []).map(p => ({
        year: p.year,
        balance: complianceData?.get(p.year)?.balance || "0",
        status: p.status,
        tokenAddress: p.tokenAddress
    }))

    const complianceInfo: Map<number, PeriodCompliance> = (() => {
        const map = new Map<number, PeriodCompliance>()
        if (complianceData) {
            complianceData.forEach((data, year) => {
                map.set(year, {
                    year: data.year,
                    tokenAddress: data.tokenAddress,
                    verifiedEmission: data.verifiedEmission,
                    surrendered: data.surrendered,
                    debt: data.localDebt,
                    priorDebt: data.priorDebt,
                    status: data.status,
                    balance: data.balance
                })
            })
        }
        return map
    })()

    // SPE tokens with selection state (from hook data + local selection)
    const speTokens: SPEToken[] = (speData?.tokens || []).map(t => {
        const existing = speTokenSelections.find(s => s.tokenId === t.tokenId)
        return {
            tokenId: t.tokenId,
            balance: t.balance,
            selected: existing?.selected || false,
            amountToUse: existing?.amountToUse || "0"
        }
    })

    const totalSpeBalance = speData?.total || "0"
    const carbonPrice = carbonPriceData

    // Selected period object (for dialog)
    const selectedPeriod = selectedPeriodYear
        ? periodAllocations.find(p => p.year === selectedPeriodYear) || null
        : null

    // Sync speTokenSelections when speData tokens change
    useEffect(() => {
        if (!speData?.tokens) return

        setSpeTokenSelections(prev => {
            // Build new array from speData tokens, preserving existing selections
            return speData.tokens.map(t => {
                const existing = prev.find(p => p.tokenId === t.tokenId)
                return {
                    tokenId: t.tokenId,
                    balance: t.balance,
                    selected: existing?.selected || false,
                    amountToUse: existing?.amountToUse || "0"
                }
            })
        })
    }, [speData?.tokens])

    // Fetch IDRS Balance when dialog opens
    useEffect(() => {
        async function fetchIdrs() {
            if (!address || !showOffsetDialog) return
            try {
                const idrsContract = getIdrsContract(await getSigner())
                const balance = await idrsContract.balanceOf(address)
                setIdrsBalance(balance.toString())
            } catch (e) {
                console.error("Failed to fetch IDRS balance", e)
            }
        }
        fetchIdrs()
    }, [address, showOffsetDialog])

    // Open Offset Dialog - Calculate shortage and prepare older periods
    const openOffsetDialog = async (period: PeriodAllocation) => {
        setOffsetLoading(true)
        try {
            setSelectedPeriodYear(period.year)
            // Reset SPE token selections
            setSpeTokenSelections(prev => prev.map(t => ({ ...t, selected: false, amountToUse: "0" })))

            // Use accumulated Prior Debt from complianceInfo (Calculated recursively in fetch)
            let priorDebtVal = BigInt(0)
            const infoLoaded = complianceInfo.get(period.year)
            if (infoLoaded && infoLoaded.priorDebt) {
                // infoLoaded.priorDebt is string representation "2000.0" (Aready formatted)
                // We need BigInt (wei) for calculation
                priorDebtVal = parseUnits(infoLoaded.priorDebt, 18)
            }
            setPriorDebt(priorDebtVal)

            // Calculate shortage (tagihan + priorDebt - current period balance)
            const info = complianceInfo.get(period.year)
            const tagihan = info ? parseUnits(info.verifiedEmission, 18) : BigInt(0)
            const currentBalance = BigInt(period.balance)
            const totalObligation = tagihan + priorDebtVal

            // Shortage is how much MORE we need
            const shortageAmount = totalObligation > currentBalance ? totalObligation - currentBalance : BigInt(0)
            setShortage(shortageAmount)

            // Prepare older periods for selection (years < target, with balance > 0)
            const older = periodAllocations
                .filter(p => p.year < period.year && BigInt(p.balance) > 0)
                .sort((a, b) => a.year - b.year) // Oldest first
                .map(p => ({
                    year: p.year,
                    tokenAddress: p.tokenAddress,
                    balance: p.balance,
                    selected: false,
                    amountToUse: "0"
                }))
            setOlderPeriods(older)

            // Reset form
            setIdrsPayAmount("")

            // Carbon Price is now fetched via useCarbonPrice hook (auto-loaded)

            setShowOffsetDialog(true)
        } catch (error) {
            console.error(error)
            toast.error("Failed to prepare offset data")
        } finally {
            setOffsetLoading(false)
        }
    }

    // Carbon price is now fetched via useCarbonPrice hook - removed fetchCarbonPrice function

    // Toggle SPE token selection
    const toggleSPEToken = (tokenId: string) => {
        setSpeTokenSelections(prev => prev.map(t => {
            if (t.tokenId === tokenId) {
                const existing = speTokens.find(s => s.tokenId === tokenId)
                const newSelected = !t.selected
                return {
                    ...t,
                    selected: newSelected,
                    amountToUse: newSelected && existing ? formatUnits(existing.balance, 18) : "0"
                }
            }
            return t
        }))
    }

    // Update SPE amount to use
    const updateSPEAmount = (tokenId: string, amount: string) => {
        setSpeTokenSelections(prev => prev.map(t =>
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

    // Calculate total offset from IDRS payment (tonInput * rate = IDRS needed)
    const calculateIdrsAmount = (): bigint => {
        if (!idrsPayAmount || !carbonPrice) return BigInt(0)
        try {
            const tonWei = parseUnits(idrsPayAmount, 18)
            const rateWei = BigInt(carbonPrice.rate)
            // Convert Ton to IDRS amount: ton * rate
            return (tonWei * rateWei) / BigInt(1e18)
        } catch {
            return BigInt(0)
        }
    }

    // Calculate equivalent Ton from idrsPayAmount (for display purposes)
    const calculateIdrsOffset = (): bigint => {
        if (!idrsPayAmount) return BigInt(0)
        try {
            return parseUnits(idrsPayAmount, 18)
        } catch {
            return BigInt(0)
        }
    }

    // Toggle Older PTBAE Period selection
    const toggleOlderPeriod = (year: number) => {
        setOlderPeriods(prev => prev.map(p => {
            if (p.year === year) {
                const newSelected = !p.selected
                return {
                    ...p,
                    selected: newSelected,
                    amountToUse: newSelected ? formatUnits(p.balance, 18) : "0"
                }
            }
            return p
        }))
    }

    // Update Older PTBAE Period amount
    const updateOlderPeriodAmount = (year: number, amount: string) => {
        setOlderPeriods(prev => prev.map(p =>
            p.year === year ? { ...p, amountToUse: amount } : p
        ))
    }

    // Calculate total from selected older periods
    const calculateOlderPeriodsTotal = (): bigint => {
        return olderPeriods
            .filter(p => p.selected && parseFloat(p.amountToUse) > 0)
            .reduce((sum, p) => {
                try {
                    return sum + parseUnits(p.amountToUse, 18)
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
            const idrsContract = getIdrsContract(signer)
            const ptbaeAddress = await ptbaeContract.getAddress()
            const idrsAddress = await idrsContract.getAddress()

            // Get selected SPE tokens for approval check
            const selectedSPEForApproval = speTokens.filter(t => t.selected && parseFloat(t.amountToUse) > 0)

            // If using SPE offset, check and request approval first
            if (selectedSPEForApproval.length > 0) {
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

                    // Wait for approval tx to be FULLY MINED (not just submitted)
                    toast.info("Menunggu konfirmasi approval...", { description: "Hash: " + approvalResult.txHash.slice(0, 10) + "..." })
                    const receipt = await signer.provider?.waitForTransaction(approvalResult.txHash, 1) // Wait for 1 confirmation
                    if (receipt?.status !== 1) {
                        throw new Error("SPE Approval transaction failed on-chain")
                    }

                    // Verify approval is now set
                    const verifyApproval = await checkSPEApproval(address, ptbaeAddress)
                    if (!verifyApproval) {
                        throw new Error("SPE Approval verification failed - try again")
                    }

                    toast.success("Approval SPE Berhasil!")
                }
            }

            // If using IDRS, check and request approval
            const idrsAmt = calculateIdrsAmount()
            if (idrsAmt > 0) {
                const isApproved = await checkIDRSApproval(address, ptbaeAddress, idrsAmt)
                if (!isApproved) {
                    toast.info("Meminta approval IDRS...", { description: "Anda perlu menyetujui transfer IDRS token" })

                    const approvalData = idrsContract.interface.encodeFunctionData("approve", [ptbaeAddress, idrsAmt])
                    const { request: approvalReq, signature: approvalSig } = await createMetaTx(
                        signer, forwarderAddress, idrsAddress, approvalData
                    )

                    toast.info("Processing Approval...", { description: "Mengirim transaksi approval IDRS..." })
                    const approvalResult = await sendMetaTx(approvalReq, approvalSig)

                    // Wait for IDRS approval tx to be FULLY MINED
                    toast.info("Menunggu konfirmasi approval IDRS...", { description: "Hash: " + approvalResult.txHash.slice(0, 10) + "..." })
                    const receipt = await signer.provider?.waitForTransaction(approvalResult.txHash, 1)
                    if (receipt?.status !== 1) {
                        throw new Error("IDRS Approval transaction failed on-chain")
                    }

                    toast.success("Approval IDRS Berhasil!")
                }
            }

            // Hybrid Surrender Logic:
            // 1. Target period PTBAE burns (from current period)
            // 2. SPE offset (if selected)
            // 3. Older PTBAE burns (if selected)
            // 4. IDRS Payment

            // NOTE: Prior Debt is now fetched and displayed.
            // The contract surrenderHybrid will automatically add prior debt to totalTagihan.
            // Here we verify frontend has enough coverage including priorDebt.

            const tagihan = parseUnits(info.verifiedEmission, 18)
            const totalTagihan = tagihan + priorDebt  // Include prior debt in total
            const targetBalance = BigInt(selectedPeriod.balance)
            const speOffset = calculateTotalOffset()
            const olderTotal = calculateOlderPeriodsTotal()
            const idrsOffset = calculateIdrsOffset()

            // Calculate: how much from target period, SPE, older, IDRS
            let remaining = totalTagihan

            // Priority: Target -> SPE -> Older -> IDRS ??
            // User said "kombinasi". Usually standard compliance logic:
            // 1. Offsets (SPE) & Credits (Older)
            // 2. Platform Currency (IDRS)
            // 3. Current Allowance

            // But our code does:
            // 1. Burn From Older (User Action)
            // 2. SurrenderHybrid calls contract:
            //    -> Adds SPE
            //    -> Adds IDRS
            //    -> Remainder from Current Balance

            // So we just need to ensure user has enough total coverage.

            const totalAvailable = targetBalance + speOffset + olderTotal + idrsOffset

            if (totalAvailable < totalTagihan) {
                // Warning only? Or block?
                // Depending on strictness. Let's block if explicitly short on visible tagihan.
                throw new Error(`Total coverage (${formatUnits(totalAvailable, 18)}) less than Total Obligation (${formatUnits(totalTagihan, 18)})`)
            }

            // Execute in order:
            // Step A: Burn from older periods first (if any)
            const selectedOlder = olderPeriods.filter(p => p.selected && parseFloat(p.amountToUse) > 0)
            let burnedFromOlder = BigInt(0)

            if (selectedOlder.length > 0) {
                toast.info("Step 1/2: Burning from older periods...")
                for (const p of selectedOlder) {
                    const amt = parseUnits(p.amountToUse, 18)
                    const contract = getPtbaeContract(signer, p.tokenAddress)
                    const data = contract.interface.encodeFunctionData("burnForCompliance", [address, amt, selectedPeriod.year])
                    const to = await contract.getAddress()
                    const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)
                    await sendMetaTx(request, signature)
                    burnedFromOlder += amt
                }
            }

            // Step B: surrenderHybrid on target period (handles SPE + IDRS + target PTBAE + Prior Debt)
            toast.info("Step 2/2: Finalizing Hybrid Surrender...")

            // Prepare data for surrenderHybrid
            const selectedSPE = speTokens.filter(t => t.selected && parseFloat(t.amountToUse) > 0)
            const speIds = selectedSPE.map(t => BigInt(t.tokenId))
            const speAmounts = selectedSPE.map(t => parseUnits(t.amountToUse, 18))

            const rate = carbonPrice ? BigInt(carbonPrice.rate) : BigInt(0)
            const timestamp = carbonPrice ? BigInt(carbonPrice.timestamp) : BigInt(0)
            const signature = carbonPrice ? carbonPrice.signature : "0x"

            const data = ptbaeContract.interface.encodeFunctionData("surrenderHybrid", [
                speIds,
                speAmounts,
                burnedFromOlder,
                idrsAmt,
                rate,
                timestamp,
                signature
            ])

            // Static call to validate before actual tx
            toast.info("Validating transaction...")
            try {
                await ptbaeContract.surrenderHybrid.staticCall(
                    speIds, speAmounts, burnedFromOlder, idrsAmt, rate, timestamp, signature
                )
                console.log("Static call validation passed")
            } catch (staticErr: any) {
                console.error("Static call failed:", staticErr)
                // Extract error message from static call
                let errorMsg = staticErr.message || "Unknown contract error"
                if (errorMsg.includes("Not audit")) {
                    throw new Error("Periode belum dalam fase AUDIT. Surrender hanya bisa dilakukan saat AUDIT.")
                } else if (errorMsg.includes("No emission")) {
                    throw new Error("Tidak ada data emisi terverifikasi untuk akun ini.")
                } else if (errorMsg.includes("Already done")) {
                    throw new Error("Anda sudah melakukan surrender untuk periode ini.")
                } else if (errorMsg.includes("Vintage too new")) {
                    throw new Error("SPE token vintage year lebih baru dari periode compliance.")
                } else if (errorMsg.includes("Token Expired")) {
                    throw new Error("SPE token sudah expired (>2 tahun dari vintage). Cek pengaturan kontrak.")
                } else if (errorMsg.includes("Price expired")) {
                    throw new Error("Carbon price sudah expired (>10 menit). Refresh halaman dan coba lagi.")
                } else if (errorMsg.includes("Inv sig") || errorMsg.includes("Invalid signature")) {
                    throw new Error("Signature carbon price tidak valid. Hubungi administrator.")
                } else if (errorMsg.includes("Insufficient PTBAE")) {
                    throw new Error("Saldo PTBAE tidak cukup untuk menutup kewajiban.")
                } else if (errorMsg.includes("Trf fail")) {
                    throw new Error("Transfer IDRS gagal. Pastikan approval dan saldo cukup.")
                }
                throw new Error(`Contract validation failed: ${errorMsg}`)
            }

            toast.info("Signing Surrender Request...", { description: "Finalizing compliance..." })
            const to = await ptbaeContract.getAddress()
            const { request, signature: metaSig } = await createMetaTx(signer, forwarderAddress, to, data)

            toast.info("Relaying Transaction...", { description: "Sending to blockchain..." })
            const txResult = await sendMetaTx(request, metaSig)

            console.log("Tx Hash:", txResult.txHash)
            toast.success("Compliance Surrender (Hybrid) Successful!")

            setShowOffsetDialog(false)
            refetchCompliance()
        } catch (error: any) {
            console.error("Surrender Error:", error)
            const msg = error.message?.toLowerCase() || ""

            // Parse specific Smart Contract errors
            if (msg.includes("rejected") || msg.includes("user rejected")) {
                toast.error("Transaksi Dibatalkan", { description: "Anda membatalkan transaksi di wallet." })
            } else if (msg.includes("insufficientptbaebalance") || msg.includes("insufficient")) {
                const info = complianceInfo.get(selectedPeriod?.year || 0)
                const tagihan = info?.verifiedEmission || "?"
                const balance = formatTon(selectedPeriod?.balance || "0")
                toast.error("Saldo PTBAE Tidak Cukup", {
                    description: `Tagihan: ${tagihan} Ton, Saldo Anda: ${balance} Ton. Silakan beli PTBAE di Trading atau gunakan SPE untuk offset.`
                })
            } else if (msg.includes("alreadysurrendered") || msg.includes("already surrendered")) {
                toast.error("Sudah Dibayar", { description: "Anda sudah menyelesaikan kewajiban untuk periode ini." })
            } else if (msg.includes("vintagetoonew") || msg.includes("vintage")) {
                toast.error("SPE Token Tidak Valid", { description: "Tahun vintage SPE token tidak boleh lebih baru dari periode compliance." })
            } else if (msg.includes("surrenderonlyinauditphase") || msg.includes("audit")) {
                toast.error("Periode Belum Masuk Audit", { description: "Pembayaran hanya dapat dilakukan saat periode dalam fase AUDIT." })
            } else if (msg.includes("noverifiedemissiondata") || msg.includes("emission")) {
                toast.error("Belum Ada Tagihan", { description: "Laporan emisi Anda belum diverifikasi oleh Oracle." })
            } else if (msg.includes("execution reverted")) {
                toast.error("Transaksi Gagal", { description: "Kemungkinan saldo tidak cukup atau ada persyaratan yang tidak terpenuhi. Periksa balance PTBAE Anda." })
            } else {
                toast.error("Terjadi Kesalahan", { description: error.message || "Silakan coba lagi." })
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

                        // Calculate Gross Obligation (Standard Emission OR Flat Penalty 1000)
                        let grossPeriodObligation = 0
                        if (info) {
                            // If Non-Compliant (3) but 0 Emission & >0 Debt => Penalty Case
                            if (info.status === 3 && parseFloat(info.verifiedEmission) === 0 && parseFloat(info.debt) > 0) {
                                grossPeriodObligation = 1000
                            } else {
                                grossPeriodObligation = parseFloat(info.verifiedEmission)
                            }
                        }
                        const totalObligation = info ? grossPeriodObligation + parseFloat(info.priorDebt || "0") : 0

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
                                            <p className="text-sm text-muted-foreground">Kewajiban Periode</p>
                                            <p className="text-xl font-bold">{grossPeriodObligation.toFixed(2)} Ton</p>
                                        </div>
                                        {info && parseFloat(info.priorDebt) > 0 && (
                                            <div>
                                                <p className="text-sm text-muted-foreground">Prior Period Debt</p>
                                                <p className="text-xl font-bold text-orange-600">{info.priorDebt} Ton</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm text-muted-foreground">Total Kewajiban</p>
                                            <p className={`text-2xl font-bold ${info && info.status === ComplianceStatus.COMPLIANT
                                                ? "text-green-600"
                                                : "text-primary"
                                                }`}>
                                                {totalObligation.toFixed(2)} Ton
                                            </p>
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

            {/* Surrender Dialog */}
            <Dialog open={showOffsetDialog} onOpenChange={setShowOffsetDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Bayar Tagihan - Period {selectedPeriod?.year}</DialogTitle>
                        <DialogDescription>
                            PTBAE periode ini digunakan dulu. Jika kurang, pilih dari SPE-GRK atau periode lama.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-muted rounded-lg text-center">
                            <div>
                                <p className="text-xs text-muted-foreground">Tagihan {selectedPeriod?.year}</p>
                                <p className="text-base font-bold">
                                    {complianceInfo.get(selectedPeriod?.year || 0)?.verifiedEmission || '0'} Ton
                                </p>
                            </div>
                            {priorDebt > 0 && (
                                <div>
                                    <p className="text-xs text-red-500">Utang Periode Lalu</p>
                                    <p className="text-base font-bold text-red-600">
                                        +{formatUnits(priorDebt, 18)} Ton
                                    </p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-muted-foreground">Saldo {selectedPeriod?.year}</p>
                                <p className="text-base font-bold text-blue-600">
                                    {formatTon(selectedPeriod?.balance || "0")} Ton
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">SPE Offset</p>
                                <p className="text-base font-bold text-green-600">
                                    {formatUnits(calculateTotalOffset(), 18)} Ton
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Periode Lama</p>
                                <p className="text-base font-bold text-orange-600">
                                    {formatUnits(calculateOlderPeriodsTotal(), 18)} Ton
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Kurang</p>
                                <p className={`text-base font-bold ${shortage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatUnits(shortage, 18)} Ton
                                </p>
                            </div>
                        </div>

                        {/* Shortage Warning */}
                        {shortage > 0 && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Saldo Periode {selectedPeriod?.year} Tidak Cukup</AlertTitle>
                                <AlertDescription>
                                    Anda perlu {formatUnits(shortage, 18)} Ton tambahan. Pilih dari periode lama di bawah.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Older Periods Selection - Only show if shortage exists */}
                        {shortage > 0 && olderPeriods.length > 0 && (
                            <div className="space-y-2">
                                <Label>Pilih PTBAE dari Periode Lama</Label>
                                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                                    {olderPeriods.map(period => (
                                        <div key={period.year} className="p-3 flex items-center gap-4">
                                            <Checkbox
                                                checked={period.selected}
                                                onCheckedChange={() => toggleOlderPeriod(period.year)}
                                                className="border-gray-400 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">Periode {period.year}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Saldo: {formatTon(period.balance)} Ton
                                                </p>
                                            </div>
                                            {period.selected && (
                                                <div className="w-32">
                                                    <Input
                                                        type="number"
                                                        value={period.amountToUse}
                                                        onChange={(e) => updateOlderPeriodAmount(period.year, e.target.value)}
                                                        max={formatUnits(period.balance, 18)}
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
                        )}

                        {/* SPE-GRK Token Selection */}
                        {speTokens.length > 0 && (
                            <div className="space-y-2">
                                <Label>Offset dengan SPE-GRK Token</Label>
                                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                                    {speTokens.map(token => (
                                        <div key={token.tokenId} className="p-3 flex items-center gap-4">
                                            <Checkbox
                                                checked={token.selected}
                                                onCheckedChange={() => toggleSPEToken(token.tokenId)}
                                                className="border-gray-400 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium">SPE #{token.tokenId.slice(0, 8)}...</p>
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
                                <p className="text-xs text-muted-foreground">
                                    Total SPE Offset: <span className="font-medium text-green-600">{formatUnits(calculateTotalOffset(), 18)} Ton</span>
                                </p>
                            </div>
                        )}

                        {/* IDRS Payment Section */}
                        <div className="space-y-2 p-3 border rounded-lg bg-slate-50 dark:bg-slate-900/50">
                            <Label>Bayar Kekurangan dengan IDRS</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Rate Saat Ini</p>
                                    {priceLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <p className="font-mono text-sm">
                                            1 Ton = {formatTon(carbonPrice?.rate || "0")} IDRS
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Saldo IDRS Anda</p>
                                    <p className="font-mono text-sm">{formatTon(idrsBalance)} IDRS</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <Input
                                        placeholder="0"
                                        value={idrsPayAmount}
                                        onChange={(e) => setIdrsPayAmount(e.target.value)}
                                        type="number"
                                    />
                                </div>
                                <div className="text-sm font-medium">Ton</div>
                            </div>
                            {calculateIdrsAmount() > 0 && (
                                <p className="text-sm text-blue-600">
                                    ≈ {formatTon(calculateIdrsAmount().toString())} IDRS Dibutuhkan
                                </p>
                            )}
                        </div>

                        {/* No older periods available */}
                        {shortage > 0 && olderPeriods.length === 0 && speTokens.length === 0 && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Tidak Ada Sumber Tambahan</AlertTitle>
                                <AlertDescription>
                                    Anda tidak memiliki PTBAE periode lama atau SPE-GRK token. Beli PTBAE di Trading.
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Sufficient balance message */}
                        {shortage === BigInt(0) && (
                            <Alert className="bg-green-50 border-green-200">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <AlertTitle className="text-green-800">Saldo Cukup</AlertTitle>
                                <AlertDescription className="text-green-700">
                                    Saldo PTBAE periode {selectedPeriod?.year} mencukupi untuk membayar tagihan.
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
