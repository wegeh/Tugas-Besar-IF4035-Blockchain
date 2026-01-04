import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/periods - Get all compliance periods
export async function GET() {
    try {
        const periods = await prisma.compliancePeriod.findMany({
            orderBy: { year: "desc" }
        })
        return NextResponse.json(periods)
    } catch (error) {
        console.error("Failed to fetch periods:", error)
        return NextResponse.json({ error: "Failed to fetch periods" }, { status: 500 })
    }
}

// POST /api/periods - Create new period
export async function POST(request: NextRequest) {
    try {
        const { year, tokenAddress } = await request.json()

        if (!year || !tokenAddress) {
            return NextResponse.json({ error: "year and tokenAddress required" }, { status: 400 })
        }

        await prisma.compliancePeriod.create({
            data: {
                year,
                tokenAddress,
                status: "ACTIVE"
            }
        })

        // Auto-close PTBAE markets expired by 2-year rule
        const thresholdYear = year - 2
        await prisma.market.updateMany({
            where: {
                periodYear: { lt: thresholdYear },
                marketType: "PTBAE",
                isOpen: true
            },
            data: { isOpen: false }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Failed to create period:", error)
        return NextResponse.json({ error: "Failed to create period" }, { status: 500 })
    }
}

// PATCH /api/periods - Update period status
export async function PATCH(request: NextRequest) {
    try {
        const { year, status } = await request.json()

        if (!year || !status) {
            return NextResponse.json({ error: "year and status required" }, { status: 400 })
        }

        if (!["ACTIVE", "AUDIT", "ENDED"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 })
        }

        const MAX_RETRIES = 3
        let attempt = 0

        while (attempt < MAX_RETRIES) {
            try {
                await prisma.compliancePeriod.update({
                    where: { year },
                    data: { status }
                })
                console.log(`[API] Period ${year} status updated to ${status}`)
                return NextResponse.json({ success: true })
            } catch (error) {
                console.error(`[Attempt ${attempt + 1}] Failed:`, error)
                attempt++
                if (attempt === MAX_RETRIES) {
                    return NextResponse.json({ error: "Failed after retries" }, { status: 500 })
                }
                await new Promise(res => setTimeout(res, 500))
            }
        }

        return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    } catch (error) {
        console.error("Failed to update period:", error)
        return NextResponse.json({ error: "Failed to update period" }, { status: 500 })
    }
}
