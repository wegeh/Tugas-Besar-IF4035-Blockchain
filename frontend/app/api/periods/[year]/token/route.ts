import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/periods/[year]/token - Get token address for a specific year
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ year: string }> }
) {
    try {
        const { year } = await params
        const yearNum = parseInt(year, 10)

        if (isNaN(yearNum)) {
            return NextResponse.json({ error: "Invalid year" }, { status: 400 })
        }

        const period = await prisma.compliancePeriod.findUnique({
            where: { year: yearNum },
            select: { tokenAddress: true }
        })

        if (!period) {
            return NextResponse.json({ error: "Period not found" }, { status: 404 })
        }

        return NextResponse.json({ tokenAddress: period.tokenAddress })
    } catch (error) {
        console.error("Failed to fetch token address:", error)
        return NextResponse.json({ error: "Failed to fetch token address" }, { status: 500 })
    }
}
