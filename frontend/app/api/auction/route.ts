import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AuctionStatus, OrderStatus, OrderSide } from "@/src/generated/prisma/enums"

/**
 * GET /api/auction
 * Get current auction window status for a market
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const marketKey = searchParams.get("marketKey")

    if (!marketKey) {
        return NextResponse.json({ error: "marketKey is required" }, { status: 400 })
    }

    try {
        const market = await prisma.market.findUnique({
            where: { marketKey },
            include: {
                auctionWindows: {
                    orderBy: { windowNumber: "desc" },
                    take: 1,
                    include: {
                        orders: {
                            where: { status: OrderStatus.OPEN },
                            select: {
                                id: true,
                                side: true,
                                price: true,
                                amount: true,
                                filledAmount: true
                            }
                        }
                    }
                }
            }
        })

        if (!market) {
            return NextResponse.json({ error: "Market not found" }, { status: 404 })
        }

        const currentWindow = market.auctionWindows[0]
        if (!currentWindow) {
            return NextResponse.json({ error: "No auction window found" }, { status: 404 })
        }

        // Calculate order book summary
        const bids = currentWindow.orders.filter(o => o.side === OrderSide.BID)
        const asks = currentWindow.orders.filter(o => o.side === OrderSide.ASK)

        const totalBidVolume = bids.reduce((sum, o) => sum + BigInt(o.amount) - BigInt(o.filledAmount), BigInt(0))
        const totalAskVolume = asks.reduce((sum, o) => sum + BigInt(o.amount) - BigInt(o.filledAmount), BigInt(0))

        // Calculate time remaining
        const now = new Date()
        const endTime = new Date(currentWindow.endTime)
        const timeRemainingMs = Math.max(0, endTime.getTime() - now.getTime())

        return NextResponse.json({
            market: {
                marketKey: market.marketKey,
                marketType: market.marketType,
                basePrice: market.basePrice,
                lastClearingPrice: market.lastClearingPrice,
                isOpen: market.isOpen,
                expiresAt: market.expiresAt ? market.expiresAt.toISOString() : null,
                isExpired: market.expiresAt ? new Date() > market.expiresAt : false,
                periodYear: market.periodYear,
                tokenId: market.tokenId
            },
            currentWindow: {
                id: currentWindow.id,
                windowNumber: currentWindow.windowNumber,
                startTime: currentWindow.startTime.toISOString(),
                endTime: currentWindow.endTime.toISOString(),
                status: currentWindow.status,
                clearingPrice: currentWindow.clearingPrice,
                totalVolume: currentWindow.totalVolume,
                timeRemainingMs,
                orderSummary: {
                    bidCount: bids.length,
                    askCount: asks.length,
                    totalBidVolume: totalBidVolume.toString(),
                    totalAskVolume: totalAskVolume.toString()
                }
            }
        })
    } catch (error) {
        console.error("Auction status error:", error)
        return NextResponse.json({ error: "Failed to fetch auction status" }, { status: 500 })
    }
}

/**
 * POST /api/auction/close
 * Close current auction window and calculate clearing price
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { action, marketKey, auctionDurationMinutes = 2 } = body

        if (action === "close") {
            return await closeAuctionWindow(marketKey)
        } else if (action === "openNew") {
            return await openNewAuctionWindow(marketKey, auctionDurationMinutes)
        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 })
        }
    } catch (error) {
        console.error("Auction action error:", error)
        return NextResponse.json({ error: "Failed to process auction action" }, { status: 500 })
    }
}

export async function closeAuctionWindow(marketKey: string) {
    // Get current open window
    const window = await prisma.auctionWindow.findFirst({
        where: { marketKey, status: AuctionStatus.OPEN },
        include: {
            orders: {
                where: { status: OrderStatus.OPEN }
            }
        }
    })

    if (!window) {
        return NextResponse.json({ error: "No open auction window found" }, { status: 404 })
    }

    // Calculate clearing price
    const { clearingPrice, matchedVolume, matches } = calculateClearingPrice(window.orders)

    // Update window status to CLOSED
    const updatedWindow = await prisma.auctionWindow.update({
        where: { id: window.id },
        data: {
            status: AuctionStatus.CLOSED,
            clearingPrice: clearingPrice?.toString() || null,
            totalVolume: matchedVolume.toString()
        }
    })

    return NextResponse.json({
        success: true,
        window: {
            id: updatedWindow.id,
            windowNumber: updatedWindow.windowNumber,
            status: updatedWindow.status,
            clearingPrice: updatedWindow.clearingPrice,
            totalVolume: updatedWindow.totalVolume
        },
        matches: matches.map(m => ({
            buyOrderId: m.buyOrderId,
            sellOrderId: m.sellOrderId,
            amount: m.amount.toString()
        }))
    })
}

export async function openNewAuctionWindow(marketKey: string, durationMinutes: number) {
    // Get last window number and market details
    const lastWindow = await prisma.auctionWindow.findFirst({
        where: { marketKey },
        orderBy: { windowNumber: "desc" },
        include: { market: true }
    })

    if (!lastWindow || !lastWindow.market) {
        // If no windows exist, fetch market directly
        const market = await prisma.market.findUnique({ where: { marketKey } })
        if (!market) return NextResponse.json({ error: "Market not found" }, { status: 404 })

        if (market.expiresAt && new Date() > market.expiresAt) {
            return NextResponse.json({ error: "Market has expired" }, { status: 400 })
        }
    } else if (lastWindow.market.expiresAt && new Date() > lastWindow.market.expiresAt) {
        return NextResponse.json({ error: "Market has expired" }, { status: 400 })
    }

    const nextWindowNumber = (lastWindow?.windowNumber || 0) + 1
    const now = new Date()
    const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000)

    const newWindow = await prisma.auctionWindow.create({
        data: {
            marketKey,
            windowNumber: nextWindowNumber,
            startTime: now,
            endTime,
            status: AuctionStatus.OPEN
        }
    })

    return NextResponse.json({
        success: true,
        window: {
            id: newWindow.id,
            windowNumber: newWindow.windowNumber,
            startTime: newWindow.startTime.toISOString(),
            endTime: newWindow.endTime.toISOString(),
            status: newWindow.status
        }
    })
}

interface OrderData {
    id: string
    side: string
    price: string
    amount: string
    filledAmount: string
}

interface Match {
    buyOrderId: string
    sellOrderId: string
    amount: bigint
}

/**
 * Calculate clearing price using single-price auction algorithm
 * 1. Get all candidate prices from BID/ASK
 * 2. For each price P:
 *    - Demand(P) = sum of BID qty where bid.price >= P
 *    - Supply(P) = sum of ASK qty where ask.price <= P
 *    - Exec(P) = min(Demand, Supply)
 * 3. Choose P with max Exec(P) as clearing price
 */
function calculateClearingPrice(orders: OrderData[]): {
    clearingPrice: bigint | null
    matchedVolume: bigint
    matches: Match[]
} {
    const bids = orders
        .filter(o => o.side === OrderSide.BID)
        .map(o => ({
            id: o.id,
            price: BigInt(o.price),
            remaining: BigInt(o.amount) - BigInt(o.filledAmount)
        }))
        .filter(o => o.remaining > 0)
        .sort((a, b) => (b.price > a.price ? 1 : -1)) // Highest price first

    const asks = orders
        .filter(o => o.side === OrderSide.ASK)
        .map(o => ({
            id: o.id,
            price: BigInt(o.price),
            remaining: BigInt(o.amount) - BigInt(o.filledAmount)
        }))
        .filter(o => o.remaining > 0)
        .sort((a, b) => (a.price > b.price ? 1 : -1)) // Lowest price first

    if (bids.length === 0 || asks.length === 0) {
        return { clearingPrice: null, matchedVolume: BigInt(0), matches: [] }
    }

    // Get all candidate prices
    const candidatePrices = [...new Set([
        ...bids.map(b => b.price),
        ...asks.map(a => a.price)
    ])].sort((a, b) => (a > b ? 1 : -1))

    let bestPrice: bigint | null = null
    let maxExec = BigInt(0)

    for (const P of candidatePrices) {
        // Demand(P) = sum of BID qty where bid.price >= P
        const demand = bids
            .filter(b => b.price >= P)
            .reduce((sum, b) => sum + b.remaining, BigInt(0))

        // Supply(P) = sum of ASK qty where ask.price <= P
        const supply = asks
            .filter(a => a.price <= P)
            .reduce((sum, a) => sum + a.remaining, BigInt(0))

        // Exec(P) = min(Demand, Supply)
        const exec = demand < supply ? demand : supply

        if (exec > maxExec) {
            maxExec = exec
            bestPrice = P
        }
    }

    if (!bestPrice || maxExec === BigInt(0)) {
        return { clearingPrice: null, matchedVolume: BigInt(0), matches: [] }
    }

    // Generate matches at clearing price
    const matches: Match[] = []
    const eligibleBids = bids.filter(b => b.price >= bestPrice).map(b => ({ ...b }))
    const eligibleAsks = asks.filter(a => a.price <= bestPrice).map(a => ({ ...a }))

    let remainingVolume = maxExec

    for (const bid of eligibleBids) {
        if (remainingVolume <= 0) break

        for (const ask of eligibleAsks) {
            if (remainingVolume <= 0 || bid.remaining <= 0 || ask.remaining <= 0) continue

            const matchAmount = [bid.remaining, ask.remaining, remainingVolume].reduce((a, b) => a < b ? a : b)

            matches.push({
                buyOrderId: bid.id,
                sellOrderId: ask.id,
                amount: matchAmount
            })

            bid.remaining -= matchAmount
            ask.remaining -= matchAmount
            remainingVolume -= matchAmount
        }
    }

    return { clearingPrice: bestPrice, matchedVolume: maxExec, matches }
}
