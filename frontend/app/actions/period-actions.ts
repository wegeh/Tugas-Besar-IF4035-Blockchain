"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export interface CompliancePeriodData {
    year: number
    tokenAddress: string
    status: string // ACTIVE, AUDIT, ENDED
    createdAt: Date
}

export async function getCompliancePeriods(): Promise<CompliancePeriodData[]> {
    try {
        const periods = await prisma.compliancePeriod.findMany({
            orderBy: {
                year: "desc"
            }
        })
        return periods
    } catch (error) {
        console.error("Failed to fetch periods:", error)
        return []
    }
}

// Used by "Start New Period" in Dashboard
export async function startNewPeriod(year: number, tokenAddress: string) {
    try {
        await prisma.compliancePeriod.create({
            data: {
                year,
                tokenAddress,
                status: "ACTIVE"
            }
        })

        // Auto-close PTBAE markets expired by 2-year rule
        // Example: If opening 2026, close markets for < 2024 (2023, 2022...)
        const thresholdYear = year - 2
        await prisma.market.updateMany({
            where: {
                periodYear: { lt: thresholdYear },
                marketType: "PTBAE",
                isOpen: true
            },
            data: { isOpen: false }
        })

        revalidatePath("/dashboard/regulator")
        return { success: true }
    } catch (error) {
        console.error("Failed to register period:", error)
        return { success: false, error: "Failed to register period in database" }
    }
}

// Used by Detail Page to get contract address
export async function getPeriodTokenAddress(year: number) {
    const period = await prisma.compliancePeriod.findUnique({
        where: { year },
        select: { tokenAddress: true }
    })
    return period?.tokenAddress || null
}

export async function updatePeriodStatus(year: number, status: "AUDIT" | "ENDED") {
    console.log(`[Action] updatePeriodStatus called for year ${year} -> ${status}`)
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        try {
            await prisma.compliancePeriod.update({
                where: { year },
                data: { status }
            })
            console.log(`[Action] DB update successful (Attempt ${attempt + 1})`)
            revalidatePath("/dashboard/regulator")
            revalidatePath(`/dashboard/regulator/${year}`)
            return { success: true }
        } catch (error) {
            console.error(`[Attempt ${attempt + 1}] Failed to update period status to ${status}:`, error)
            attempt++;
            if (attempt === MAX_RETRIES) {
                return { success: false, error: "Failed to update period status after multiple retries" }
            }
            // Wait 500ms before retry
            await new Promise(res => setTimeout(res, 500));
        }
    }
    return { success: false, error: "Unexpected error loop exit" }
}
