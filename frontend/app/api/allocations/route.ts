import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Role } from "@/src/generated/prisma/client"

// GET /api/allocations?year=X - Get allocations for a specific year
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const yearStr = searchParams.get("year")

        if (!yearStr) {
            return NextResponse.json({ error: "year query param required" }, { status: 400 })
        }

        const year = parseInt(yearStr, 10)
        if (isNaN(year)) {
            return NextResponse.json({ error: "Invalid year" }, { status: 400 })
        }

        const allocations = await prisma.allocation.findMany({
            where: { periodYear: year },
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
            orderBy: { createdAt: "desc" }
        })

        return NextResponse.json(allocations)
    } catch (error) {
        console.error("Failed to fetch allocations:", error)
        return NextResponse.json({ error: "Failed to fetch allocations" }, { status: 500 })
    }
}

// POST /api/allocations - Record new allocation(s)
export async function POST(request: NextRequest) {
    try {
        const { periodYear, companyWalletAddresses, amount, txHash } = await request.json()

        if (!periodYear || !companyWalletAddresses || !amount || !txHash) {
            return NextResponse.json({
                error: "periodYear, companyWalletAddresses, amount, and txHash required"
            }, { status: 400 })
        }

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
            return NextResponse.json({
                error: "No matching companies found for provided addresses"
            }, { status: 404 })
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

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to record allocation:", error)
        return NextResponse.json({ error: "Failed to record allocation" }, { status: 500 })
    }
}
