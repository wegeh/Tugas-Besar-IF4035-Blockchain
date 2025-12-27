"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export interface CompliancePeriodData {
    year: number
    tokenAddress: string
    isActive: boolean
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
                isActive: true
            }
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

export async function endPeriod(year: number) {
    try {
        await prisma.compliancePeriod.update({
            where: { year },
            data: { isActive: false }
        })
        revalidatePath("/dashboard/regulator")
        revalidatePath(`/dashboard/regulator/${year}`)
        return { success: true }
    } catch (error) {
        console.error("Failed to end period:", error)
        return { success: false, error: "Failed to end period" }
    }
}
