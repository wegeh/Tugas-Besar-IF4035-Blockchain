import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OrderStatus, OrderSide } from "@/src/generated/prisma/enums"

interface MatchResult {
    clearingPrice: string
    matchedVolume: string
    matches: {
        buyOrderId: string
        buyOnChainId: string
        sellOrderId: string
        sellOnChainId: string
        amount: string
    }[]
}

/**
 * POST /api/match
 * Call Auction Matching Algorithm
 * 
 * Finds Single Clearing Price using Intersection of Curves:
 * 1. Collect all unique prices from bids and asks
 * 2. For each price P, calculate:
 *    - Demand(P) = Total volume of bids with price >= P
 *    - Supply(P) = Total volume of asks with price <= P
 * 3. Executable Volume at P = min(Demand(P), Supply(P))
 * 4. Clearing Price = Price with maximum Executable Volume
 * 5. All matched trades execute at this single price
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { marketKey } = body

        if (!marketKey) {
            return NextResponse.json({ error: "marketKey required" }, { status: 400 })
        }

        // Get all open orders for this market
        const orders = await prisma.order.findMany({
            where: {
                marketKey,
                status: OrderStatus.OPEN,
            },
            orderBy: { createdAt: "asc" }, // FIFO for tie-breaking
        })

        // Separate bids and asks
        const bids = orders.filter((o) => o.side === OrderSide.BID)
        const asks = orders.filter((o) => o.side === OrderSide.ASK)

        console.log(`[Match] Market: ${marketKey}, Bids: ${bids.length}, Asks: ${asks.length}`)

        if (bids.length === 0 || asks.length === 0) {
            return NextResponse.json({
                marketKey,
                clearingPrice: null,
                matchedVolume: "0",
                matches: [],
                message: "No matching possible (missing bids or asks)"
            })
        }

        // Collect all unique candidate prices
        const allPrices = new Set<string>()
        bids.forEach(b => allPrices.add(b.price))
        asks.forEach(a => allPrices.add(a.price))

        const candidatePrices = Array.from(allPrices)
            .map(p => BigInt(p))
            .sort((a, b) => Number(b - a)) // Descending order

        // Find clearing price with maximum executable volume
        let bestPrice = BigInt(0)
        let bestVolume = BigInt(0)

        for (const price of candidatePrices) {
            // Demand at price P = sum of bid amounts where bid.price >= P
            const demand = bids
                .filter(b => BigInt(b.price) >= price)
                .reduce((sum, b) => sum + (BigInt(b.amount) - BigInt(b.filledAmount)), BigInt(0))

            // Supply at price P = sum of ask amounts where ask.price <= P
            const supply = asks
                .filter(a => BigInt(a.price) <= price)
                .reduce((sum, a) => sum + (BigInt(a.amount) - BigInt(a.filledAmount)), BigInt(0))

            // Executable volume = min(demand, supply)
            const executableVolume = demand < supply ? demand : supply

            console.log(`[Match] Price ${price}: Demand=${demand}, Supply=${supply}, Exec=${executableVolume}`)

            if (executableVolume > bestVolume) {
                bestVolume = executableVolume
                bestPrice = price
            }
        }

        if (bestVolume === BigInt(0)) {
            return NextResponse.json({
                marketKey,
                clearingPrice: null,
                matchedVolume: "0",
                matches: [],
                message: "No price intersection found (bid prices < ask prices)"
            })
        }

        console.log(`[Match] Clearing Price: ${bestPrice}, Volume: ${bestVolume}`)

        // Now match orders at the clearing price
        // Eligible: bids with price >= clearingPrice, asks with price <= clearingPrice
        const eligibleBids = bids
            .filter(b => BigInt(b.price) >= bestPrice)
            .sort((a, b) => {
                // Sort by price (highest first), then by time (oldest first)
                const priceDiff = Number(BigInt(b.price) - BigInt(a.price))
                if (priceDiff !== 0) return priceDiff
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            })

        const eligibleAsks = asks
            .filter(a => BigInt(a.price) <= bestPrice)
            .sort((a, b) => {
                // Sort by price (lowest first), then by time (oldest first)
                const priceDiff = Number(BigInt(a.price) - BigInt(b.price))
                if (priceDiff !== 0) return priceDiff
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            })

        const matches: MatchResult["matches"] = []
        let remainingVolume = bestVolume

        // Track remaining amounts for partial fills
        const bidRemaining = new Map<string, bigint>()
        const askRemaining = new Map<string, bigint>()

        eligibleBids.forEach(b => bidRemaining.set(b.id, BigInt(b.amount) - BigInt(b.filledAmount)))
        eligibleAsks.forEach(a => askRemaining.set(a.id, BigInt(a.amount) - BigInt(a.filledAmount)))

        // Match bids against asks
        for (const bid of eligibleBids) {
            if (remainingVolume <= 0) break
            if (bid.traderId === null) continue

            const bidRem = bidRemaining.get(bid.id) || BigInt(0)
            if (bidRem <= 0) continue

            for (const ask of eligibleAsks) {
                if (remainingVolume <= 0) break
                if (ask.traderId === bid.traderId) continue // No self-trade

                const askRem = askRemaining.get(ask.id) || BigInt(0)
                if (askRem <= 0) continue

                // Trade amount = min of both remaining and overall remaining
                let tradeAmount = bidRem < askRem ? bidRem : askRem
                if (tradeAmount > remainingVolume) tradeAmount = remainingVolume

                matches.push({
                    buyOrderId: bid.id,
                    buyOnChainId: bid.onChainId?.toString() || "",
                    sellOrderId: ask.id,
                    sellOnChainId: ask.onChainId?.toString() || "",
                    amount: tradeAmount.toString()
                })

                // Update tracking
                bidRemaining.set(bid.id, bidRem - tradeAmount)
                askRemaining.set(ask.id, askRem - tradeAmount)
                remainingVolume -= tradeAmount
            }
        }

        return NextResponse.json({
            marketKey,
            clearingPrice: bestPrice.toString(),
            matchedVolume: bestVolume.toString(),
            matches,
            totalMatches: matches.length,
        })
    } catch (error) {
        console.error("Matching error:", error)
        return NextResponse.json({ error: "Failed to match orders" }, { status: 500 })
    }
}
