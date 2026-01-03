"use client"

import { useQuery } from "@tanstack/react-query"

export interface CarbonPriceData {
    rate: string
    timestamp: number
    signature: string
}

/**
 * Hook to fetch current carbon price from Oracle API.
 */
export function useCarbonPrice() {
    return useQuery({
        queryKey: ["carbon", "price"],
        queryFn: async (): Promise<CarbonPriceData | null> => {
            const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_API_URL || "http://localhost:3001"
            const res = await fetch(`${oracleUrl}/carbon-price`)

            if (!res.ok) {
                throw new Error("Failed to fetch carbon price")
            }

            const data = await res.json()

            if (data.rate) {
                return {
                    rate: data.rate,
                    timestamp: data.timestamp,
                    signature: data.signature
                }
            }

            return null
        },
        staleTime: 60 * 1000, // 1 minute
        retry: 2,
        refetchOnWindowFocus: false
    })
}
