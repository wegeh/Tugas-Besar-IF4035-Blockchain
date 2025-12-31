
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { formatUnits } from "ethers"

function formatPrice(weiPrice: string): string {
    try {
        return parseFloat(formatUnits(weiPrice, 18)).toLocaleString("id-ID", { maximumFractionDigits: 2 })
    } catch {
        return "0"
    }
}

export default function TradingPage() {
    const router = useRouter()
    const [markets, setMarkets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [filterType, setFilterType] = useState<"ALL" | "SPE" | "PTBAE">("ALL")

    useEffect(() => {
        loadMarkets()
    }, [])

    async function loadMarkets() {
        setLoading(true)
        try {
            const res = await fetch("/api/markets")
            if (res.ok) {
                const data = await res.json()
                setMarkets(data.markets)
            }
        } catch (error) {
            console.error("Failed to load markets", error)
            toast.error("Gagal memuat daftar pasar")
        } finally {
            setLoading(false)
        }
    }

    const filteredMarkets = markets.filter(m => {
        if (filterType !== "ALL" && m.marketType !== filterType) return false
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            const matchName = m.marketType === "SPE" ? `spe token #${m.tokenId}` : `ptbae year ${m.periodYear}`
            const matchKey = m.marketKey.toLowerCase()
            return matchName.includes(q) || matchKey.includes(q)
        }
        return true
    })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Daftar Pasar Karbon</h1>
                <p className="text-muted-foreground">Pilih pasar untuk mulai berdagang</p>
            </div>

            <div className="flex flex-col md:flex-row gap-4 justify-between items-end">
                <div className="w-full md:w-1/3">
                    <Label className="mb-2 block">Cari Pasar</Label>
                    <Input
                        placeholder="Cari ID, Tahun, atau Token..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <Tabs value={filterType} onValueChange={(v) => setFilterType(v as "ALL" | "SPE" | "PTBAE")}>
                    <TabsList>
                        <TabsTrigger value="ALL">Semua</TabsTrigger>
                        <TabsTrigger value="SPE">SPE-GRK</TabsTrigger>
                        <TabsTrigger value="PTBAE">PTBAE</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
            ) : (
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama Pasar</TableHead>
                                <TableHead>Tipe</TableHead>
                                <TableHead>ID Pasar</TableHead>
                                <TableHead>Harga Dasar</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMarkets.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        Tidak ada pasar yang ditemukan.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredMarkets.map((m) => (
                                    <TableRow
                                        key={m.marketKey}
                                        onClick={() => router.push(`/dashboard/company/trading/${m.marketKey}`)}
                                        className="cursor-pointer hover:bg-muted/50"
                                    >
                                        <TableCell className="font-medium">
                                            <MarketDisplayName
                                                marketType={m.marketType}
                                                tokenId={m.tokenId}
                                                periodYear={m.periodYear}
                                                marketKey={m.marketKey}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={m.marketType === "SPE" ? "default" : "secondary"}>{m.marketType}</Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{m.marketKey}</TableCell>
                                        <TableCell>Rp {formatPrice(m.basePrice)}</TableCell>
                                        <TableCell>
                                            {m.isExpired ? (
                                                <Badge variant="destructive">Expired</Badge>
                                            ) : (
                                                <span className={m.isOpen ? "text-green-600 font-medium" : "text-red-600"}>
                                                    {m.isOpen ? "Open" : "Closed"}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="outline" onClick={(e) => {
                                                e.stopPropagation()
                                                router.push(`/dashboard/company/trading/${m.marketKey}`)
                                            }}>
                                                Trade &rarr;
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </Card>
            )}
        </div>
    )
}

function MarketDisplayName({ marketType, tokenId, periodYear, marketKey }: { marketType: string, tokenId: any, periodYear: any, marketKey: string }) {
    const [name, setName] = useState(
        marketType === "SPE" ? `SPE Token #${tokenId}` : `PTBAE Tahun ${periodYear}`
    )
    const [fetched, setFetched] = useState(false)

    useEffect(() => {
        if (marketType === "SPE" && tokenId && !fetched) {
            import("@/lib/contracts").then(async ({ getSPEUnit }) => {
                try {
                    const meta = await getSPEUnit(tokenId)
                    if (meta) {
                        setName(`SPE ${meta.projectId} - ${meta.vintageYear}`)
                    }
                } catch { }
                setFetched(true)
            })
        }
    }, [marketType, tokenId, fetched])

    return <span>{name}</span>
}
