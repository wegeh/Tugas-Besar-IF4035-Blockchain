"use client"

import { useQuery } from "@tanstack/react-query"
import { getUnallocatedCompanies, getAllocatedCompanies, getAllCompanies } from "@/app/actions/allocation"

/**
 * Hook to fetch all registered companies.
 * Returns data directly from Server Action (types inferred).
 */
export function useAllCompanies() {
    return useQuery({
        queryKey: ["companies", "all"],
        queryFn: async () => {
            const companies = await getAllCompanies()
            return companies
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
        queryFn: async () => {
            const companies = await getUnallocatedCompanies(year)
            return companies
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
        queryFn: async () => {
            const allocations = await getAllocatedCompanies(year)
            return allocations
        },
        enabled: year > 0,
        staleTime: 30 * 1000
    })
}

