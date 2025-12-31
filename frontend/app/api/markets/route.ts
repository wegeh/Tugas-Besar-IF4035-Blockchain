import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MarketType } from "@/src/generated/prisma/enums"

/**
 * GET /api/markets
 * List all markets with base price and last clearing price
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const marketType = searchParams.get("marketType") as MarketType | null

    try {
        const whereClause: { marketType?: MarketType } = {}
        if (marketType) {
            whereClause.marketType = marketType
        }

        const markets = await prisma.market.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            include: {
                auctionWindows: {
                    where: { status: "OPEN" },
                    take: 1,
                    orderBy: { windowNumber: "desc" }
                }
            }
        })

        // PTBAE markets are created when Finalized. 
        // So if it exists in DB, it is valid to display. 
        // We only check for Expiration (active for 2 years).

        return NextResponse.json({
            markets: markets.map(m => ({
                id: m.id,
                marketKey: m.marketKey,
                marketType: m.marketType,
                tokenId: m.tokenId,
                periodYear: m.periodYear,
                basePrice: m.basePrice,
                lastClearingPrice: m.lastClearingPrice,
                isOpen: m.isOpen,
                expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
                isExpired: m.marketType === "PTBAE" && m.periodYear
                    ? new Date().getFullYear() > (m.periodYear + 2)
                    : (m.expiresAt ? new Date() > m.expiresAt : false),
                currentWindow: m.auctionWindows[0] ? {
                    id: m.auctionWindows[0].id,
                    windowNumber: m.auctionWindows[0].windowNumber,
                    startTime: m.auctionWindows[0].startTime.toISOString(),
                    endTime: m.auctionWindows[0].endTime.toISOString(),
                    status: m.auctionWindows[0].status
                } : null
            }))
        })
    } catch (error) {
        console.error("Markets fetch error:", error)
        return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 })
    }
}

/**
 * POST /api/markets
 * Create a new market with base price (one-time)
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { marketType, tokenId, periodYear, basePrice, auctionDurationMinutes = 2, expiresAt } = body

        if (!marketType || !basePrice) {
            return NextResponse.json({ error: "marketType and basePrice are required" }, { status: 400 })
        }

        // Generate market key (Human Readable)
        let marketKey: string
        if (marketType === "SPE") {
            if (!tokenId) {
                return NextResponse.json({ error: "tokenId required for SPE market" }, { status: 400 })
            }
            marketKey = `SPE-${tokenId}`
        } else {
            if (!periodYear) {
                return NextResponse.json({ error: "periodYear required for PTBAE market" }, { status: 400 })
            }
            marketKey = `PTBAE-${periodYear}`
        }

        // Check if market already exists
        const existingMarket = await prisma.market.findUnique({
            where: { marketKey }
        })

        if (existingMarket) {
            return NextResponse.json({ error: "Market already exists" }, { status: 409 })
        }

        // Create market and first auction window
        const now = new Date()
        const endTime = new Date(now.getTime() + auctionDurationMinutes * 60 * 1000)

        const market = await prisma.market.create({
            data: {
                marketKey,
                marketType: marketType as MarketType,
                tokenId: tokenId ? tokenId.toString() : null,
                periodYear: marketType === "PTBAE" ? parseInt(periodYear) : null,
                basePrice: basePrice.toString(),
                isOpen: true,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                auctionWindows: {
                    create: {
                        windowNumber: 1,
                        startTime: now,
                        endTime: endTime,
                        status: "OPEN"
                    }
                }
            },
            include: {
                auctionWindows: true
            }
        })

        return NextResponse.json({
            success: true,
            market: {
                id: market.id,
                marketKey: market.marketKey,
                marketType: market.marketType,
                basePrice: market.basePrice,
                currentWindow: market.auctionWindows[0]
            }
        })
    } catch (error) {
        console.error("Market creation error:", error)
        return NextResponse.json({ error: "Failed to create market" }, { status: 500 })
    }
}
