"use client"

import { useQuery } from "@tanstack/react-query"

interface Company {
    id: string
    walletAddress: string
    companyName: string | null
    email: string | null
}

interface Allocation {
    id: string
    periodYear: number
    companyId: string
    amount: string
    txHash: string
    createdAt: string
    company: Company
}

/**
 * Hook to fetch all registered companies.
 */
export function useAllCompanies() {
    return useQuery({
        queryKey: ["companies", "all"],
        queryFn: async (): Promise<Company[]> => {
            const res = await fetch("/api/companies")
            if (!res.ok) throw new Error("Failed to fetch companies")
            return res.json()
        },
        staleTime: 60 * 1000
    })
}

/**
 * Hook to fetch unallocated companies for a specific period.
 */
export function useUnallocatedCompanies(year: number) {
    return useQuery({
        queryKey: ["companies", "unallocated", year],
        queryFn: async (): Promise<Company[]> => {
            const res = await fetch(`/api/companies?allocated=false&year=${year}`)
            if (!res.ok) throw new Error("Failed to fetch unallocated companies")
            return res.json()
        },
        enabled: year > 0,
        staleTime: 30 * 1000
    })
}

/**
 * Hook to fetch allocated companies (allocation history) for a period.
 */
export function useAllocations(year: number) {
    return useQuery({
        queryKey: ["allocations", year],
        queryFn: async (): Promise<Allocation[]> => {
            const res = await fetch(`/api/allocations?year=${year}`)
            if (!res.ok) throw new Error("Failed to fetch allocations")
            return res.json()
        },
        enabled: year > 0,
        staleTime: 30 * 1000
    })
}
