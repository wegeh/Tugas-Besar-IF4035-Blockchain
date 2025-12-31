
"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2, TrendingUp, TrendingDown, RefreshCw, X, Clock, Timer } from "lucide-react"
import { formatUnits, parseUnits } from "ethers"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import {
    getSigner,
    forwarderAddress,
    getExchangeContract,
    getIdrcContract,
    getSpeContract,
    getPtbaeContract,
    getIdrcBalance,
    getTotalSPEBalance,
    exchangeAddress
} from "@/lib/contracts"
import { getCompliancePeriods } from "@/app/actions/period-actions"

// --- INTERFACES ---
interface OrderBookEntry {
    id: string
    onChainId: string
    price: string
    amount: string
    remaining: string
    trader: string
}

interface OrderBook {
    bids: OrderBookEntry[]
    asks: OrderBookEntry[]
}

interface MyOrder {
    id: string
    onChainId: string
    side: "BID" | "ASK"
    price: string
    amount: string
    filledAmount: string
    remaining: string
    status: string
    marketKey: string
    createdAt: string
}

interface MarketInfo {
    marketKey: string
    marketType: "SPE" | "PTBAE"
    tokenId?: string
    periodYear?: number
    basePrice: string
    lastClearingPrice: string | null
    isOpen: boolean
    isExpired?: boolean
    expiresAt?: string | null
}

interface AuctionWindow {
    id: string
    windowNumber: number
    startTime: string
    endTime: string
    status: "OPEN" | "CLOSED" | "SETTLED"
    timeRemainingMs: number
    orderSummary: {
        bidCount: number
        askCount: number
        totalBidVolume: string
        totalAskVolume: string
    }
}

// --- HELPERS ---
function formatPrice(weiPrice: string): string {
    try {
        return parseFloat(formatUnits(weiPrice, 18)).toLocaleString("id-ID", { maximumFractionDigits: 2 })
    } catch {
        return "0"
    }
}

function formatAmount(weiAmount: string): string {
    try {
        // Show up to 4 decimal places for tons
        return parseFloat(formatUnits(weiAmount, 18)).toLocaleString("id-ID", { maximumFractionDigits: 4 })
    } catch {
        return "0"
    }
}

export default function MarketDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { address } = useAccount()
    const marketKey = params.marketKey as string

    // --- STATE ---
    const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null)
    const [speMeta, setSpeMeta] = useState<any>(null) // Added speMeta state
    const [auctionWindow, setAuctionWindow] = useState<AuctionWindow | null>(null)
    const [timeRemaining, setTimeRemaining] = useState(0)

    // Order Book & User Data
    const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] })
    const [myOrders, setMyOrders] = useState<MyOrder[]>([])
    const [trades, setTrades] = useState<any[]>([])

    // Form State
    const [orderSide, setOrderSide] = useState<"BID" | "ASK">("BID")
    const [orderPrice, setOrderPrice] = useState("")
    const [orderAmount, setOrderAmount] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [refreshing, setRefreshing] = useState(false)

    // Balances
    const [idrcBalance, setIdrcBalance] = useState("0")
    const [assetBalance, setAssetBalance] = useState("0")

    // --- EFFECT: Polling Data ---
    useEffect(() => {
        if (!marketKey) return

        // Initial load
        loadMarketData()

        // Adaptive Polling:
        // If time is close to 0 (<= 5s), poll every 1s to catch window rotation.
        // Otherwise poll every 4s to keep orderbook fresh.
        const isSettling = timeRemaining <= 5000
        const intervalMs = isSettling ? 1000 : 4000

        const interval = setInterval(loadMarketData, intervalMs)
        return () => clearInterval(interval)
    }, [marketKey, address, timeRemaining <= 5000])

    // --- TIMER ---
    useEffect(() => {
        if (timeRemaining <= 0) return
        const timer = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1000) return 0
                return prev - 1000
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [timeRemaining])

    function formatTimeRemaining(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    // --- DATA FETCHING ---
    async function loadMarketData() {
        setRefreshing(true)
        try {
            // Get Market Info
            const auctionRes = await fetch(`/api/auction?marketKey=${marketKey}`)
            if (!auctionRes.ok) throw new Error("Market not found")

            const auctionData = await auctionRes.json()
            setMarketInfo(auctionData.market)
            setAuctionWindow(auctionData.currentWindow)
            setTimeRemaining(auctionData.currentWindow?.timeRemainingMs || 0)

            const mInfo = auctionData.market

            // Fetch SPE Metadata
            if (mInfo.marketType === "SPE" && mInfo.tokenId) {
                try {
                    const { getSPEUnit } = await import("@/lib/contracts")
                    const meta = await getSPEUnit(mInfo.tokenId)
                    if (meta) setSpeMeta(meta)
                } catch (e) { console.warn("Failed to fetch SPE meta", e) }
            }

            // Order Book
            const bookParams = new URLSearchParams()
            bookParams.set("marketType", mInfo.marketType)
            if (mInfo.marketType === "SPE") bookParams.set("tokenId", mInfo.tokenId)
            else bookParams.set("periodYear", mInfo.periodYear)

            const bookRes = await fetch(`/api/orderbook?${bookParams}`)
            if (bookRes.ok) {
                const bookData = await bookRes.json()
                setOrderBook({ bids: bookData.bids || [], asks: bookData.asks || [] })
            }

            // Trade History
            const tradesRes = await fetch(`/api/trades?marketKey=${marketKey}`)
            if (tradesRes.ok) {
                const tradesData = await tradesRes.json()
                setTrades(tradesData.trades || [])
            }

            // User Data
            if (address) {
                const ordersRes = await fetch(`/api/orders?walletAddress=${address}&marketKey=${marketKey}`)
                if (ordersRes.ok) {
                    const ordersData = await ordersRes.json()
                    setMyOrders(ordersData.orders || [])
                }

                const idrc = await getIdrcBalance(address)
                setIdrcBalance(idrc)

                if (mInfo.marketType === "SPE") {
                    const speData = await getTotalSPEBalance(address)
                    const token = speData.tokens.find((t: any) => t.tokenId.toString() === mInfo.tokenId.toString())
                    setAssetBalance(token ? token.balance : "0")
                } else if (mInfo.marketType === "PTBAE" && mInfo.tokenId) {
                    const signer = await getSigner()
                    const ptbae = await getPtbaeContract(signer, mInfo.tokenId)
                    const bal = await ptbae.balanceOf(address)
                    setAssetBalance(bal.toString())
                }
            }
        } catch (error) {
            console.error(error)
            toast.error("Gagal memuat data pasar")
        } finally {
            setRefreshing(false)
        }
    }

    // --- ACTIONS ---
    async function handleCreateOrder() {
        if (!address) {
            toast.error("Hubungkan wallet terlebih dahulu")
            return
        }
        if (!orderPrice || !orderAmount) {
            toast.error("Isi harga dan jumlah")
            return
        }
        if (!marketInfo) return

        // --- VALIDATIONS ---
        const priceWei = parseUnits(orderPrice, 18)
        const amountWei = parseUnits(orderAmount, 18)

        if (orderSide === "BID") {
            const cost = priceWei * amountWei / BigInt(1e18)
            if (cost > BigInt(idrcBalance)) {
                toast.error("Saldo IDRC Tidak Cukup")
                return
            }
        } else {
            if (amountWei > BigInt(assetBalance)) {
                toast.error(`Saldo ${marketInfo.marketType} Tidak Cukup`)
                return
            }
        }

        // Initial Ask Rule
        if (orderSide === "ASK" && orderBook.asks.length === 0) {
            const basePriceVal = parseFloat(formatUnits(marketInfo.basePrice, 18))
            const inputPrice = parseFloat(orderPrice)
            const maxPrice = basePriceVal * 1.30

            if (inputPrice < basePriceVal) {
                toast.error(`Harga minimal: ${basePriceVal}`)
                return
            }
            if (inputPrice > maxPrice) {
                toast.error(`Harga maksimal: ${maxPrice}`)
                return
            }
        }

        setSubmitting(true)
        try {
            const signer = await getSigner()
            const exchange = getExchangeContract(signer)

            // Approval Logic
            if (marketInfo.marketType === "SPE") {
                if (orderSide === "ASK") {
                    const speContract = getSpeContract(signer)
                    const isApproved = await speContract.isApprovedForAll(address, exchangeAddress)
                    if (!isApproved) {
                        toast.info("Meminta Approval Sinyal...")
                        const data = speContract.interface.encodeFunctionData("setApprovalForAll", [exchangeAddress, true])
                        const speAddr = await speContract.getAddress()
                        const { request, signature } = await createMetaTx(signer, forwarderAddress, speAddr, data)

                        const txResult = await sendMetaTx(request, signature)
                        toast.info("Menunggu Konfirmasi Approval...")

                        const receipt = await signer.provider?.waitForTransaction(txResult.txHash)
                        if (receipt?.status !== 1) throw new Error("Approval Transaction Failed on-chain")
                        toast.success("Approval Berhasil!")
                    }
                } else {
                    await checkAndApproveIDRC(signer, exchangeAddress)
                }
            } else {
                // PTBAE
                const periods = await getCompliancePeriods()
                const p = periods.find(p => p.year === marketInfo.periodYear)
                if (!p) throw new Error("Period Data Not Found")

                if (orderSide === "ASK") {
                    const ptbae = await getPtbaeContract(signer, p.tokenAddress)
                    const bal = await ptbae.allowance(address, exchangeAddress)
                    if (bal < amountWei) {
                        toast.info("Meminta Approval PTBAE...")
                        const data = ptbae.interface.encodeFunctionData("approve", [exchangeAddress, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")])
                        const { request, signature } = await createMetaTx(signer, forwarderAddress, p.tokenAddress, data)

                        const txResult = await sendMetaTx(request, signature)
                        toast.info("Menunggu Konfirmasi Approval...")
                        const receipt = await signer.provider?.waitForTransaction(txResult.txHash)
                        if (receipt?.status !== 1) throw new Error("Approval PTBAE Failed")
                        toast.success("Approval Berhasil!")
                    }
                } else {
                    await checkAndApproveIDRC(signer, exchangeAddress)
                }
            }

            // --- CREATE ORDER ---
            let data = ""
            if (marketInfo.marketType === "SPE") {
                const side = orderSide === "BID" ? 0 : 1
                data = exchange.interface.encodeFunctionData("createSPEOrder", [
                    BigInt(marketInfo.tokenId!), side, priceWei, amountWei
                ])
            } else {
                const periods = await getCompliancePeriods()
                const p = periods.find(p => p.year === marketInfo.periodYear)
                const side = orderSide === "BID" ? 0 : 1
                data = exchange.interface.encodeFunctionData("createPTBAEOrder", [
                    p!.tokenAddress, marketInfo.periodYear, side, priceWei, amountWei
                ])
            }

            toast.info("Membuat Order...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, exchangeAddress, data)
            const result = await sendMetaTx(request, signature)

            // Find Log for Order ID
            let onChainId = 0
            try {
                const receipt = await signer.provider?.waitForTransaction(result.txHash)
                if (receipt) {
                    for (const log of receipt.logs) {
                        try {
                            const parsed = exchange.interface.parseLog({ topics: log.topics as string[], data: log.data })
                            if (parsed?.name === "OrderCreated") {
                                onChainId = Number(parsed.args.orderId)
                                break
                            }
                        } catch { }
                    }
                }
            } catch (e) { console.warn("Failed to parse log", e) }

            // Record to DB
            const periods = await getCompliancePeriods()
            const p = marketInfo.marketType === "PTBAE" ? periods.find(p => p.year === marketInfo.periodYear) : null

            await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    walletAddress: address,
                    onChainId: onChainId,
                    marketType: marketInfo.marketType,
                    marketKey: marketKey,
                    tokenId: marketInfo.tokenId,
                    periodYear: marketInfo.periodYear,
                    ptbaeAddress: p?.tokenAddress,
                    side: orderSide,
                    price: priceWei.toString(),
                    amount: amountWei.toString(),
                    txHash: result.txHash
                })
            })

            toast.success("Order Berhasil Dibuat!")
            setOrderPrice("")
            setOrderAmount("")
            loadMarketData()

        } catch (error: any) {
            console.error(error)
            toast.error("Gagal: " + (error.shortMessage || error.message))
        } finally {
            setSubmitting(false)
        }
    }

    async function checkAndApproveIDRC(signer: any, exchangeAddr: string) {
        const idrc = getIdrcContract(signer)
        const allowed = await idrc.allowance(address, exchangeAddr)

        if (allowed < parseUnits("1000000", 18)) {
            toast.info("Meminta Approval IDRC...")
            const data = idrc.interface.encodeFunctionData("approve", [exchangeAddr, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")])
            const idrcAddr = await idrc.getAddress()
            const { request, signature } = await createMetaTx(signer, forwarderAddress, idrcAddr, data)

            const txResult = await sendMetaTx(request, signature)
            toast.info("Menunggu Konfirmasi IDRC...")
            const receipt = await signer.provider?.waitForTransaction(txResult.txHash)
            if (receipt?.status !== 1) throw new Error("IDRC Approval Failed")
            toast.success("IDRC Approved!")
        }
    }

    async function handleCancelOrder(id: string, onChainId: string) {
        try {
            const signer = await getSigner()
            const exchange = getExchangeContract(signer)
            const data = exchange.interface.encodeFunctionData("cancelOrder", [BigInt(onChainId)])

            toast.info("Membatalkan...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, exchangeAddress, data)
            await sendMetaTx(request, signature)
            toast.success("Order Dibatalkan")
            loadMarketData()
        } catch (e) {
            toast.error("Gagal Cancel")
        }
    }

    if (!marketInfo) return <div className="p-12 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div>

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => router.push("/dashboard/company/trading")} className="pl-0 hover:pl-2">
                &larr; Kembali ke Daftar
            </Button>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">
                        {marketInfo.marketType === "SPE"
                            ? `SPE ${speMeta ? `${speMeta.projectId} - ${speMeta.vintageYear}` : `#${marketInfo.tokenId}`}`
                            : `PTBAE ${marketInfo.periodYear}`}
                    </h1>
                    <div className="text-muted-foreground flex items-center gap-2 mt-1">
                        <Badge variant="outline" title={marketKey}>
                            {marketKey.length > 20 ? `${marketKey.substring(0, 10)}...${marketKey.substring(marketKey.length - 6)}` : marketKey}
                        </Badge>
                        <span className="text-sm">Harga Dasar: Rp {formatPrice(marketInfo.basePrice)}</span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Card className="px-4 py-2 flex flex-col justify-center">
                        <span className="text-xs text-muted-foreground">Saldo IDRC</span>
                        <span className="font-bold text-lg">{formatPrice(idrcBalance)}</span>
                    </Card>
                    <Card className="px-4 py-2 flex flex-col justify-center">
                        <span className="text-xs text-muted-foreground">Saldo {marketInfo.marketType} {marketInfo.marketType === "PTBAE" ? "(Ton)" : ""}</span>
                        <span className="font-bold text-lg">{formatAmount(assetBalance)}</span>
                    </Card>
                    <Button variant="outline" size="icon" onClick={loadMarketData} disabled={refreshing}>
                        <RefreshCw className={refreshing ? "animate-spin" : ""} />
                    </Button>
                </div>
            </div>

            {/* Call Auction Timer Status */}
            {marketInfo.isExpired ? (
                <Card className="bg-red-50 border-red-200">
                    <CardContent className="flex items-center gap-4 py-4">
                        <Clock className="h-8 w-8 text-red-600" />
                        <div>
                            <h4 className="font-bold text-red-800">Market Expired</h4>
                            <p className="text-sm text-red-600">Perdagangan telah ditutup.</p>
                        </div>
                    </CardContent>
                </Card>
            ) : auctionWindow && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="py-4">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                                <Timer className="text-blue-600" />
                                <span className="font-bold text-blue-900">Window #{auctionWindow.windowNumber}</span>
                                <Badge variant={auctionWindow.status === "OPEN" ? "default" : "secondary"}>{auctionWindow.status}</Badge>
                            </div>
                            <div className="text-2xl font-mono font-bold text-blue-700">
                                {timeRemaining <= 0 ? (
                                    <span className="text-yellow-600 text-lg animate-pulse">Sedang Settlement...</span>
                                ) : (
                                    formatTimeRemaining(timeRemaining)
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-white rounded p-2">
                                <div className="text-xs text-muted-foreground">Total Beli</div>
                                <div className="font-bold text-green-600">{formatAmount(auctionWindow.orderSummary.totalBidVolume)}</div>
                            </div>
                            <div className="bg-white rounded p-2">
                                <div className="text-xs text-muted-foreground">Last Clearing</div>
                                <div className="font-bold text-gray-900">{marketInfo.lastClearingPrice ? formatPrice(marketInfo.lastClearingPrice) : "-"}</div>
                            </div>
                            <div className="bg-white rounded p-2">
                                <div className="text-xs text-muted-foreground">Total Jual</div>
                                <div className="font-bold text-red-600">{formatAmount(auctionWindow.orderSummary.totalAskVolume)}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid md:grid-cols-3 gap-6">
                {/* Order Book (Hidden) */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Order Book (Blind Auction)</CardTitle>
                        <CardDescription>Order book disembunyikan untuk mencegah manipulasi harga.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <h4 className="font-semibold text-green-600 flex items-center gap-2"><TrendingUp size={16} /> Bids</h4>
                                <div className="h-[200px] flex items-center justify-center bg-muted/30 rounded border border-dashed">
                                    <span className="text-muted-foreground text-sm">{auctionWindow?.orderSummary.bidCount} Active Bids</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-semibold text-red-600 flex items-center gap-2"><TrendingDown size={16} /> Asks</h4>
                                <div className="h-[200px] flex items-center justify-center bg-muted/30 rounded border border-dashed">
                                    <span className="text-muted-foreground text-sm">{auctionWindow?.orderSummary.askCount} Active Asks</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Order Form */}
                <Card>
                    <CardHeader>
                        <CardTitle>Buat Order</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                            <Button
                                variant={orderSide === "BID" ? "default" : "ghost"}
                                className={orderSide === "BID" ? "bg-green-600 hover:bg-green-700" : ""}
                                onClick={() => setOrderSide("BID")}
                            >
                                Beli (BID)
                            </Button>
                            <Button
                                variant={orderSide === "ASK" ? "default" : "ghost"}
                                className={orderSide === "ASK" ? "bg-red-600 hover:bg-red-700" : ""}
                                onClick={() => setOrderSide("ASK")}
                            >
                                Jual (ASK)
                            </Button>
                        </div>

                        <div className="space-y-2">
                            <Label>Harga (IDRP)</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={orderPrice}
                                onChange={e => setOrderPrice(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Jumlah ({marketInfo.marketType}) {marketInfo.marketType === "PTBAE" ? "(Ton)" : ""}</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={orderAmount}
                                onChange={e => setOrderAmount(e.target.value)}
                            />
                        </div>

                        <div className="pt-2">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-muted-foreground">Estimasi Total</span>
                                <span className="font-bold">
                                    {orderPrice && orderAmount ?
                                        formatPrice((parseUnits(orderPrice, 18) * parseUnits(orderAmount, 18) / BigInt(1e18)).toString())
                                        : "0"}
                                </span>
                            </div>

                            <Button
                                className={`w-full ${orderSide === "BID" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                                onClick={handleCreateOrder}
                                disabled={submitting || marketInfo.isExpired || !auctionWindow || auctionWindow.status !== "OPEN"}
                            >
                                {submitting ? <Loader2 className="animate-spin mr-2" /> : null}
                                {marketInfo.isExpired ? "Market Expired" : "Pasang Order"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* My Orders */}
            <Card>
                <CardHeader>
                    <CardTitle>Order Saya</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Waktu</TableHead>
                                <TableHead>Tipe</TableHead>
                                <TableHead>Harga</TableHead>
                                <TableHead>Jumlah</TableHead>
                                <TableHead>Filled</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {myOrders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Belum ada order aktif</TableCell>
                                </TableRow>
                            ) : (
                                myOrders.map(order => (
                                    <TableRow key={order.id}>
                                        <TableCell className="text-xs font-mono">{new Date(order.createdAt).toLocaleTimeString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={order.side === "BID" ? "default" : "destructive"}>{order.side}</Badge>
                                        </TableCell>
                                        <TableCell>{formatPrice(order.price)}</TableCell>
                                        <TableCell>{formatAmount(order.amount)}</TableCell>
                                        <TableCell>{formatAmount(order.filledAmount)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{order.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {(order.status === "OPEN" || order.status === "PARTIAL") && (
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleCancelOrder(order.id, order.onChainId)}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Public Trade History */}
            <Card>
                <CardHeader>
                    <CardTitle>Riwayat Transaksi (Settlement)</CardTitle>
                    <CardDescription>Daftar transaksi yang telah diselesaikan pada sesi lelang sebelumnya</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Waktu</TableHead>
                                <TableHead>Harga Clearing</TableHead>
                                <TableHead>Jumlah</TableHead>
                                <TableHead>Total Nilai</TableHead>
                                <TableHead>Tx Hash</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {trades.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada transaksi</TableCell>
                                </TableRow>
                            ) : (
                                trades.map(trade => (
                                    <TableRow key={trade.id}>
                                        <TableCell className="text-xs font-mono">{new Date(trade.executedAt).toLocaleTimeString()}</TableCell>
                                        <TableCell>{formatPrice(trade.price)}</TableCell>
                                        <TableCell>{formatAmount(trade.amount)}</TableCell>
                                        <TableCell>Rp {formatPrice((BigInt(trade.price) * BigInt(trade.amount) / BigInt(1e18)).toString())}</TableCell>
                                        <TableCell>
                                            <a href={`https://testnet.l1scan.com/tx/${trade.txHash}`} target="_blank" className="text-blue-600 hover:underline text-xs font-mono">
                                                {trade.txHash.slice(0, 8)}...
                                            </a>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
