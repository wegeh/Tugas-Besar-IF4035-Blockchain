"use client"

import { useQuery } from "@tanstack/react-query"
import { getAllGreenProjects, type ProjectData } from "@/lib/contracts"

export interface SPESubmission {
    user: string
    data: ProjectData
}

/**
 * Hook to fetch all SPE project submissions (for Regulator Issuance page).
 */
export function useSPESubmissions() {
    return useQuery({
        queryKey: ["spe", "submissions"],
        queryFn: async (): Promise<SPESubmission[]> => {
            return getAllGreenProjects()
        },
        staleTime: 30 * 1000
    })
}

/**
 * Hook to fetch user's own SPE project submissions.
 */
export function useUserSPEProjects(address: string | undefined) {
    return useQuery({
        queryKey: ["spe", "projects", address],
        queryFn: async () => {
            if (!address) return []
            const { getUserProjects } = await import("@/lib/contracts")
            return getUserProjects(address)
        },
        enabled: !!address,
        staleTime: 30 * 1000
    })
}
