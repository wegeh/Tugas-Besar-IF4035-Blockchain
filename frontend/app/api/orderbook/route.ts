import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OrderStatus, MarketType } from "@/src/generated/prisma/enums"

/**
 * GET /api/orderbook
 * Fetch order book for a specific market
 * Query params: marketType (SPE|PTBAE), tokenId (for SPE), periodYear (for PTBAE)
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const marketType = searchParams.get("marketType") as MarketType | null
    const tokenId = searchParams.get("tokenId")
    const periodYear = searchParams.get("periodYear")

    if (!marketType) {
        return NextResponse.json({ error: "marketType required" }, { status: 400 })
    }

    // Build market key based on type
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

    try {
        // Fetch open orders for this market
        const orders = await prisma.order.findMany({
            where: {
                marketKey,
                status: OrderStatus.OPEN,
            },
            include: {
                trader: {
                    select: {
                        walletAddress: true,
                        companyName: true,
                    },
                },
            },
            orderBy: [
                { price: "desc" }, // Higher price first for bids
            ],
        })

        // Separate bids and asks
        const bids = orders
            .filter((o) => o.side === "BID")
            .sort((a, b) => Number(BigInt(b.price) - BigInt(a.price))) // Highest first
        const asks = orders
            .filter((o) => o.side === "ASK")
            .sort((a, b) => Number(BigInt(a.price) - BigInt(b.price))) // Lowest first

        return NextResponse.json({
            marketKey,
            marketType,
            bids: bids.map((o) => ({
                id: o.id,
                onChainId: o.onChainId?.toString() || null,
                price: o.price,
                amount: o.amount,
                filledAmount: o.filledAmount,
                remaining: (BigInt(o.amount) - BigInt(o.filledAmount)).toString(),
                trader: o.trader.companyName || o.trader.walletAddress.slice(0, 10) + "...",
            })),
            asks: asks.map((o) => ({
                id: o.id,
                onChainId: o.onChainId?.toString() || null,
                price: o.price,
                amount: o.amount,
                filledAmount: o.filledAmount,
                remaining: (BigInt(o.amount) - BigInt(o.filledAmount)).toString(),
                trader: o.trader.companyName || o.trader.walletAddress.slice(0, 10) + "...",
            })),
        })
    } catch (error) {
        console.error("Orderbook fetch error:", error)
        return NextResponse.json({ error: "Failed to fetch orderbook" }, { status: 500 })
    }
}
