'use server'

import { prisma } from '@/lib/prisma'
import { Role } from '@/src/generated/prisma/client'
import { revalidatePath } from 'next/cache'

// Get list of companies that HAVE NOT been allocated for a specific period
export async function getUnallocatedCompanies(periodYear: number) {
    // 1. Get all companies
    const allCompanies = await prisma.user.findMany({
        where: { role: Role.COMPANY },
        select: {
            id: true,
            walletAddress: true,
            companyName: true,
            email: true,
            allocations: {
                where: { periodYear: periodYear },
                select: { id: true }
            }
        }
    })

    // 2. Filter out those who have an allocation for this year
    const unallocated = allCompanies.filter(c => c.allocations.length === 0)

    // Return clean objects
    return unallocated.map(({ allocations, ...company }) => company)
}

// Get list of companies that HAVE been allocated for a specific period
export async function getAllocatedCompanies(periodYear: number) {
    const allocations = await prisma.allocation.findMany({
        where: { periodYear: periodYear },
        include: {
            company: {
                select: {
                    id: true,
                    companyName: true,
                    walletAddress: true,
                    email: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    return allocations
}

// Record a new allocation in the database (called after meta-tx success)
export async function recordAllocation(periodYear: number, companyWalletAddresses: string[], amount: string, txHash: string) {
    try {
        console.log(`Recording allocation for year ${periodYear} to ${companyWalletAddresses.length} companies`)

        // Resolve wallet addresses to User IDs
        const companies = await prisma.user.findMany({
            where: {
                walletAddress: { in: companyWalletAddresses },
                role: Role.COMPANY
            },
            select: { id: true }
        })

        if (companies.length === 0) {
            throw new Error("No matching companies found for provided addresses")
        }

        // Batch create allocations
        const operations = companies.map(company =>
            prisma.allocation.create({
                data: {
                    periodYear: periodYear,
                    companyId: company.id,
                    amount: amount,
                    txHash: txHash
                }
            })
        )

        await prisma.$transaction(operations)

        revalidatePath(`/dashboard/regulator/${periodYear}`)
        return { success: true }
    } catch (error) {
        console.error("Failed to record allocation:", error)
        return { success: false, error: String(error) }
    }
}
