import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OrderStatus } from "@/src/generated/prisma/enums"

/**
 * GET /api/trades
 * Fetch trade history for a market or user
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const marketKey = searchParams.get("marketKey")
    const walletAddress = searchParams.get("walletAddress")
    const limit = parseInt(searchParams.get("limit") || "50")

    try {
        const whereClause: any = {}

        if (marketKey) {
            whereClause.marketKey = marketKey
        }

        if (walletAddress) {
            const user = await prisma.user.findUnique({
                where: { walletAddress: walletAddress.toLowerCase() },
            })

            if (user) {
                whereClause.OR = [
                    { buyOrder: { traderId: user.id } },
                    { sellOrder: { traderId: user.id } },
                ]
            }
        }

        const trades = await prisma.trade.findMany({
            where: whereClause,
            include: {
                buyOrder: {
                    include: {
                        trader: {
                            select: { walletAddress: true, companyName: true },
                        },
                    },
                },
                sellOrder: {
                    include: {
                        trader: {
                            select: { walletAddress: true, companyName: true },
                        },
                    },
                },
            },
            orderBy: { executedAt: "desc" },
            take: limit,
        })

        return NextResponse.json({
            trades: trades.map((t) => ({
                id: t.id,
                marketKey: t.marketKey,
                buyer: t.buyOrder.trader.companyName || t.buyOrder.trader.walletAddress.slice(0, 10) + "...",
                seller: t.sellOrder.trader.companyName || t.sellOrder.trader.walletAddress.slice(0, 10) + "...",
                price: t.price,
                amount: t.amount,
                txHash: t.txHash,
                executedAt: t.executedAt.toISOString(),
            })),
        })
    } catch (error) {
        console.error("Trades fetch error:", error)
        return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 })
    }
}

/**
 * POST /api/trades
 * Record an executed trade after on-chain settlement
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { buyOrderId, sellOrderId, price, amount, txHash } = body

        if (!buyOrderId || !sellOrderId || !price || !amount || !txHash) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // Get orders
        const buyOrder = await prisma.order.findUnique({ where: { id: buyOrderId } })
        const sellOrder = await prisma.order.findUnique({ where: { id: sellOrderId } })

        if (!buyOrder || !sellOrder) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 })
        }

        // Update orders and create trade in transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update buy order
            const newBuyFilled = BigInt(buyOrder.filledAmount) + BigInt(amount)
            const buyStatus = newBuyFilled >= BigInt(buyOrder.amount)
                ? OrderStatus.FILLED
                : OrderStatus.PARTIALLY_FILLED

            await tx.order.update({
                where: { id: buyOrderId },
                data: {
                    filledAmount: newBuyFilled.toString(),
                    status: buyStatus,
                },
            })

            // Update sell order
            const newSellFilled = BigInt(sellOrder.filledAmount) + BigInt(amount)
            const sellStatus = newSellFilled >= BigInt(sellOrder.amount)
                ? OrderStatus.FILLED
                : OrderStatus.PARTIALLY_FILLED

            await tx.order.update({
                where: { id: sellOrderId },
                data: {
                    filledAmount: newSellFilled.toString(),
                    status: sellStatus,
                },
            })

            // Create trade record
            const trade = await tx.trade.create({
                data: {
                    marketKey: buyOrder.marketKey,
                    buyOrderId,
                    sellOrderId,
                    price,
                    amount,
                    txHash,
                },
            })

            return trade
        })

        return NextResponse.json({
            success: true,
            trade: {
                id: result.id,
                txHash: result.txHash,
            },
        })
    } catch (error) {
        console.error("Trade recording error:", error)
        return NextResponse.json({ error: "Failed to record trade" }, { status: 500 })
    }
}
