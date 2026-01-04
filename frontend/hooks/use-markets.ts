"use client"

import { useQuery } from "@tanstack/react-query"

export interface Market {
    id: string
    marketKey: string
    marketType: "PTBAE" | "SPE"
    periodYear: number | null
    tokenId: string | null
    basePrice: string
    isOpen: boolean
    isExpired?: boolean
    expiresAt: string | null
    createdAt: string
}

/**
 * Hook to fetch all available markets from backend API.
 */
export function useMarkets() {
    return useQuery({
        queryKey: ["markets"],
        queryFn: async (): Promise<Market[]> => {
            const res = await fetch("/api/markets")

            if (!res.ok) {
                throw new Error("Failed to fetch markets")
            }

            const data = await res.json()
            // API returns { markets: [...] } not array directly
            return data.markets || []
        },
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false
    })
}

/**
 * Hook to fetch orderbook for a specific market.
 */
export function useOrderbook(marketKey: string) {
    return useQuery({
        queryKey: ["orderbook", marketKey],
        queryFn: async () => {
            const res = await fetch(`/api/orderbook?market=${marketKey}`)

            if (!res.ok) {
                throw new Error("Failed to fetch orderbook")
            }

            return res.json()
        },
        enabled: !!marketKey,
        staleTime: 10 * 1000, // 10 seconds for orderbook
        refetchOnWindowFocus: true,
        refetchInterval: 30 * 1000 // Auto-refetch every 30s
    })
}

/**
 * Hook to fetch user's orders.
 */
export function useUserOrders(address: string | undefined) {
    return useQuery({
        queryKey: ["orders", address],
        queryFn: async () => {
            if (!address) return []

            const res = await fetch(`/api/orders?user=${address}`)

            if (!res.ok) {
                throw new Error("Failed to fetch orders")
            }

            return res.json()
        },
        enabled: !!address,
        staleTime: 15 * 1000,
        refetchOnWindowFocus: true
    })
}
