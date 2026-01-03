"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useConnection } from "wagmi"
import { getIdrcBalance, getTotalSPEBalance, getSigner, getPtbaeContract, getSPEUnit } from "@/lib/contracts"

// ============================================================
// Auction / Market Detail Hook
// ============================================================

export interface AuctionMarketInfo {
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

export interface AuctionWindow {
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

export interface SPEMeta {
    projectId: string
    vintageYear: number
    methodology: string
    registryRef: string
}

export interface AuctionData {
    market: AuctionMarketInfo
    currentWindow: AuctionWindow | null
    speMeta: SPEMeta | null
}

/**
 * Hook to fetch auction/market data with adaptive polling.
 * Polls faster (1s) when near settlement, slower (4s) otherwise.
 * 
 * @param marketKey - The market key to fetch data for
 * @param isSettling - Pass true when timeRemaining <= 5000ms to trigger fast polling
 */
export function useAuctionData(marketKey: string, isSettling: boolean = false) {
    return useQuery({
        queryKey: ["auction", marketKey],
        queryFn: async (): Promise<AuctionData> => {
            const res = await fetch(`/api/auction?marketKey=${marketKey}`)
            if (!res.ok) throw new Error("Market not found")

            const data = await res.json()
            const market = data.market as AuctionMarketInfo
            const currentWindow = data.currentWindow as AuctionWindow | null

            // Fetch SPE metadata if applicable
            let speMeta: SPEMeta | null = null
            if (market.marketType === "SPE" && market.tokenId) {
                try {
                    const meta = await getSPEUnit(BigInt(market.tokenId))
                    if (meta) speMeta = meta
                } catch { /* ignore */ }
            }

            return { market, currentWindow, speMeta }
        },
        enabled: !!marketKey,
        staleTime: 2 * 1000, // 2 seconds
        // Adaptive polling: 1s when settling, 4s otherwise
        refetchInterval: isSettling ? 1000 : 4000,
        refetchOnWindowFocus: true
    })
}

// ============================================================
// Orderbook Hook (Enhanced)
// ============================================================

export interface OrderBookEntry {
    id: string
    onChainId: string
    price: string
    amount: string
    remaining: string
    trader: string
}

export interface OrderBook {
    bids: OrderBookEntry[]
    asks: OrderBookEntry[]
}

/**
 * Hook to fetch orderbook for a market with adaptive polling.
 */
export function useMarketOrderbook(
    marketType: "SPE" | "PTBAE" | undefined,
    tokenId: string | undefined,
    periodYear: number | undefined,
    isSettling: boolean = false
) {
    return useQuery({
        queryKey: ["orderbook", marketType, tokenId, periodYear],
        queryFn: async (): Promise<OrderBook> => {
            const params = new URLSearchParams()
            if (marketType) params.set("marketType", marketType)
            if (marketType === "SPE" && tokenId) params.set("tokenId", tokenId)
            if (marketType === "PTBAE" && periodYear) params.set("periodYear", periodYear.toString())

            const res = await fetch(`/api/orderbook?${params}`)
            if (!res.ok) throw new Error("Failed to fetch orderbook")

            const data = await res.json()
            return { bids: data.bids || [], asks: data.asks || [] }
        },
        enabled: !!marketType,
        staleTime: 2 * 1000,
        refetchInterval: isSettling ? 1000 : 4000,
        refetchOnWindowFocus: true
    })
}

// ============================================================
// Trade History Hook
// ============================================================

export interface Trade {
    id: string
    price: string
    amount: string
    executedAt: string
    txHash: string
}

export function useTradeHistory(marketKey: string) {
    return useQuery({
        queryKey: ["trades", marketKey],
        queryFn: async (): Promise<Trade[]> => {
            const res = await fetch(`/api/trades?marketKey=${marketKey}`)
            if (!res.ok) throw new Error("Failed to fetch trades")

            const data = await res.json()
            return data.trades || []
        },
        enabled: !!marketKey,
        staleTime: 10 * 1000, // 10 seconds
        refetchInterval: 30 * 1000, // Slower polling for history
        refetchOnWindowFocus: true
    })
}

// ============================================================
// Market User Orders Hook
// ============================================================

export interface MyOrder {
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

export function useMarketOrders(address: string | undefined, marketKey: string, isSettling: boolean = false) {
    return useQuery({
        queryKey: ["orders", address, marketKey],
        queryFn: async (): Promise<MyOrder[]> => {
            if (!address) return []

            const res = await fetch(`/api/orders?walletAddress=${address}&marketKey=${marketKey}`)
            if (!res.ok) throw new Error("Failed to fetch orders")

            const data = await res.json()
            return data.orders || []
        },
        enabled: !!address && !!marketKey,
        staleTime: 2 * 1000,
        refetchInterval: isSettling ? 1000 : 4000,
        refetchOnWindowFocus: true
    })
}

// ============================================================
// User Balances Hook (IDRC + Asset)
// ============================================================

export interface UserBalances {
    idrcBalance: string
    assetBalance: string
}

export function useUserBalances(
    address: string | undefined,
    marketType: "SPE" | "PTBAE" | undefined,
    tokenId: string | undefined
) {
    return useQuery({
        queryKey: ["balances", address, marketType, tokenId],
        queryFn: async (): Promise<UserBalances> => {
            if (!address) return { idrcBalance: "0", assetBalance: "0" }

            const idrcBalance = await getIdrcBalance(address)
            let assetBalance = "0"

            if (marketType === "SPE" && tokenId) {
                const speData = await getTotalSPEBalance(address)
                const token = speData.tokens.find((t: { tokenId: string }) => t.tokenId.toString() === tokenId.toString())
                assetBalance = token ? token.balance : "0"
            } else if (marketType === "PTBAE" && tokenId) {
                const signer = await getSigner()
                const ptbae = await getPtbaeContract(signer, tokenId)
                const bal = await ptbae.balanceOf(address)
                assetBalance = bal.toString()
            }

            return { idrcBalance, assetBalance }
        },
        enabled: !!address && !!marketType,
        staleTime: 15 * 1000,
        refetchOnWindowFocus: true
    })
}
