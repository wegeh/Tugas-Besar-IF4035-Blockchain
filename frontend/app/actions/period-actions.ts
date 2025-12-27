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

export async function registerPeriod(year: number, tokenAddress: string) {
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
