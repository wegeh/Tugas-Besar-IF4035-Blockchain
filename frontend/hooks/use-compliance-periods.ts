"use client"

import { useQuery } from "@tanstack/react-query"
import { getTokenAddressForPeriod, getPeriodStatus, PeriodStatus } from "@/lib/contracts"

export interface CompliancePeriod {
    year: number
    status: "ACTIVE" | "AUDIT" | "ENDED"
    tokenAddress: string
    createdAt?: string
}

/**
 * Hook to fetch all compliance periods from the database and smart contracts.
 * Combines database period info with on-chain token addresses.
 */
export function useCompliancePeriods() {
    return useQuery({
        queryKey: ["compliance", "periods"],
        queryFn: async (): Promise<CompliancePeriod[]> => {
            // 1. Fetch periods from API
            const res = await fetch("/api/periods")
            if (!res.ok) throw new Error("Failed to fetch periods")
            const dbPeriods = await res.json()

            // 2. Enrich with on-chain token addresses
            const enrichedPeriods = await Promise.all(
                dbPeriods.map(async (p: { year: number; tokenAddress: string; status: string; createdAt?: string }) => {
                    const tokenAddress = p.tokenAddress || await getTokenAddressForPeriod(p.year)
                    return {
                        year: p.year,
                        status: p.status as "ACTIVE" | "AUDIT" | "ENDED",
                        tokenAddress: tokenAddress || "",
                        createdAt: p.createdAt
                    }
                })
            )

            return enrichedPeriods.sort((a, b) => b.year - a.year) // Newest first
        },
        staleTime: 30 * 1000, // 30 seconds
        refetchOnWindowFocus: false
    })
}
