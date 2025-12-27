"use server"

import { prisma } from "@/lib/prisma"

export interface CompanyData {
    walletAddress: string
    companyName: string
    email: string
}

export async function getRegisteredCompanies(): Promise<CompanyData[]> {
    try {
        const companies = await prisma.user.findMany({
            where: {
                role: "COMPANY",
            },
            select: {
                walletAddress: true,
                companyName: true,
                email: true,
            },
            orderBy: {
                companyName: "asc",
            },
        })
        return companies.map(c => ({
            walletAddress: c.walletAddress,
            companyName: c.companyName || "Unknown Company",
            email: c.email || ""
        }))
    } catch (error) {
        console.error("Failed to fetch companies:", error)
        return []
    }
}
