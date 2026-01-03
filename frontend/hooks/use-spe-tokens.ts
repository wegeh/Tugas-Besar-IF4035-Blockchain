"use client"

import { useQuery } from "@tanstack/react-query"
import { useConnection } from "wagmi"
import { getTotalSPEBalance } from "@/lib/contracts"

export interface SPETokenBalance {
    tokenId: string
    balance: string // Raw wei
    balanceFormatted: string // Ton
}

export interface SPEBalanceData {
    total: string // Raw wei
    totalFormatted: string // Ton
    tokens: SPETokenBalance[]
}

/**
 * Hook to fetch user's SPE-GRK token balances.
 */
export function useSPETokens() {
    const { address } = useConnection()

    return useQuery({
        queryKey: ["spe", "tokens", address],
        queryFn: async (): Promise<SPEBalanceData> => {
            if (!address) {
                return { total: "0", totalFormatted: "0", tokens: [] }
            }

            const speData = await getTotalSPEBalance(address)

            return {
                total: speData.total,
                totalFormatted: (BigInt(speData.total) / BigInt(10 ** 18)).toString(),
                tokens: speData.tokens.map(t => ({
                    tokenId: t.tokenId,
                    balance: t.balance,
                    balanceFormatted: (BigInt(t.balance) / BigInt(10 ** 18)).toString()
                }))
            }
        },
        enabled: !!address,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false
    })
}
