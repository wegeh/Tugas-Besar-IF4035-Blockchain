"use client"

import { useQuery } from "@tanstack/react-query"
import { useConnection } from "wagmi"
import { useCompliancePeriods, type CompliancePeriod } from "./use-compliance-periods"
import { getComplianceInfo, getPTBAEBalanceForPeriod, ComplianceStatus } from "@/lib/contracts"

export interface PeriodComplianceData {
    year: number
    tokenAddress: string
    verifiedEmission: string // Formatted (Ton)
    surrendered: string      // Formatted (Ton)
    localDebt: string        // Current period debt (Ton)
    priorDebt: string        // Cumulative debt from ALL previous periods (Ton)
    totalObligation: string  // localDebt + priorDebt (Ton)
    status: ComplianceStatus
    balance: string          // Raw wei balance
}

/**
 * Core compliance hook that:
 * 1. Fetches compliance info for all periods
 * 2. Calculates RECURSIVE debt accumulation (carry-over)
 * 3. Returns a Map of year -> ComplianceData
 */
export function useComplianceData() {
    const { address } = useConnection()
    const { data: periods, isLoading: periodsLoading } = useCompliancePeriods()

    return useQuery({
        queryKey: ["compliance", "data", address],
        queryFn: async (): Promise<Map<number, PeriodComplianceData>> => {
            if (!address || !periods || periods.length === 0) {
                return new Map()
            }

            const resultMap = new Map<number, PeriodComplianceData>()
            const rawInfos = new Map<number, any>()

            // Phase A: Fetch raw compliance data from all contracts
            await Promise.all(
                periods.map(async (period) => {
                    if (!period.tokenAddress) return
                    const info = await getComplianceInfo(period.year, address)
                    const balance = await getPTBAEBalanceForPeriod(address, period.year)
                    if (info) {
                        rawInfos.set(period.year, { ...info, balance })
                    }
                })
            )

            // Phase B: Calculate Cumulative Debt (Oldest to Newest)
            // This ensures debt from 2024 carries to 2025, and (2024+2025) carries to 2026
            const sortedYears = periods.map(p => p.year).sort((a, b) => a - b)
            let runningCumulativeDebt = BigInt(0)

            for (const year of sortedYears) {
                const info = rawInfos.get(year)
                const period = periods.find(p => p.year === year)
                if (!info || !period) continue

                const currentLocalDebt = BigInt(info.debt)
                const priorDebtValue = runningCumulativeDebt

                // Format values (wei to Ton)
                const localDebtTon = (currentLocalDebt / BigInt(10 ** 18)).toString()
                const priorDebtTon = (priorDebtValue / BigInt(10 ** 18)).toString()
                const totalObligationTon = ((currentLocalDebt + priorDebtValue) / BigInt(10 ** 18)).toString()

                resultMap.set(year, {
                    year,
                    tokenAddress: period.tokenAddress,
                    verifiedEmission: (BigInt(info.verifiedEmission) / BigInt(10 ** 18)).toString(),
                    surrendered: (BigInt(info.surrendered) / BigInt(10 ** 18)).toString(),
                    localDebt: localDebtTon,
                    priorDebt: priorDebtTon,
                    totalObligation: totalObligationTon,
                    status: info.status,
                    balance: info.balance
                })

                // Add current debt to cumulative for NEXT year
                runningCumulativeDebt += currentLocalDebt
            }

            return resultMap
        },
        enabled: !!address && !periodsLoading && !!periods && periods.length > 0,
        staleTime: 30 * 1000, // 30 seconds
        refetchOnWindowFocus: false
    })
}

/**
 * Get computed gross period obligation (handles 1000 Ton penalty for No Data)
 */
export function getGrossPeriodObligation(data: PeriodComplianceData): number {
    // If Non-Compliant (3) but 0 Emission & >0 Debt => Penalty Case
    if (data.status === ComplianceStatus.NON_COMPLIANT &&
        parseFloat(data.verifiedEmission) === 0 &&
        parseFloat(data.localDebt) > 0) {
        return 1000
    }
    return parseFloat(data.verifiedEmission)
}
