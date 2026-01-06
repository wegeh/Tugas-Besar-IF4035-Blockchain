import { prisma } from "@/lib/prisma"
import { OrderStatus, OrderSide } from "@/src/generated/prisma/enums"

export interface MatchResult {
    marketKey: string
    clearingPrice: string | null
    matchedVolume: string
    matches: {
        buyOrderId: string
        buyOnChainId: string
        sellOrderId: string
        sellOnChainId: string
        amount: string
    }[]
    message?: string
}

/**
 * Call Auction Matching Algorithm
 * Finds Single Clearing Price where Demand and Supply curves intersect.
 */
export async function calculateMatches(marketKey: string): Promise<MatchResult> {
    const orders = await prisma.order.findMany({
        where: { marketKey, status: OrderStatus.OPEN },
        orderBy: { createdAt: "asc" },
    })

    const bids = orders.filter((o) => o.side === OrderSide.BID)
    const asks = orders.filter((o) => o.side === OrderSide.ASK)

    console.log(`[Matcher] Market: ${marketKey}, Bids: ${bids.length}, Asks: ${asks.length}`)

    if (bids.length === 0 || asks.length === 0) {
        return {
            marketKey,
            clearingPrice: null,
            matchedVolume: "0",
            matches: [],
            message: "No matching possible (missing bids or asks)"
        }
    }

    const allPrices = new Set<string>()
    bids.forEach(b => allPrices.add(b.price))
    asks.forEach(a => allPrices.add(a.price))

    const candidatePrices = Array.from(allPrices)
        .map(p => BigInt(p))
        .sort((a, b) => Number(b - a))

    let bestPrice = BigInt(0)
    let bestVolume = BigInt(0)

    for (const price of candidatePrices) {
        const demand = bids
            .filter(b => BigInt(b.price) >= price)
            .reduce((sum, b) => sum + (BigInt(b.amount) - BigInt(b.filledAmount)), BigInt(0))

        const supply = asks
            .filter(a => BigInt(a.price) <= price)
            .reduce((sum, a) => sum + (BigInt(a.amount) - BigInt(a.filledAmount)), BigInt(0))

        const executableVolume = demand < supply ? demand : supply

        if (executableVolume > bestVolume) {
            bestVolume = executableVolume
            bestPrice = price
        }
    }

    if (bestVolume === BigInt(0)) {
        return {
            marketKey,
            clearingPrice: null,
            matchedVolume: "0",
            matches: [],
            message: "No price intersection found (bid prices < ask prices)"
        }
    }

    console.log(`[Matcher] Clearing Price: ${bestPrice}, Volume: ${bestVolume}`)

    const eligibleBids = bids
        .filter(b => BigInt(b.price) >= bestPrice)
        .sort((a, b) => {
            const priceDiff = Number(BigInt(b.price) - BigInt(a.price))
            if (priceDiff !== 0) return priceDiff
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })

    const eligibleAsks = asks
        .filter(a => BigInt(a.price) <= bestPrice)
        .sort((a, b) => {
            const priceDiff = Number(BigInt(a.price) - BigInt(b.price))
            if (priceDiff !== 0) return priceDiff
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })

    const matches: MatchResult["matches"] = []
    let remainingVolume = bestVolume

    const bidRemaining = new Map<string, bigint>()
    const askRemaining = new Map<string, bigint>()

    eligibleBids.forEach(b => bidRemaining.set(b.id, BigInt(b.amount) - BigInt(b.filledAmount)))
    eligibleAsks.forEach(a => askRemaining.set(a.id, BigInt(a.amount) - BigInt(a.filledAmount)))

    for (const bid of eligibleBids) {
        if (remainingVolume <= 0) break
        if (bid.traderId === null) continue

        const bidRem = bidRemaining.get(bid.id) || BigInt(0)
        if (bidRem <= 0) continue

        for (const ask of eligibleAsks) {
            if (remainingVolume <= 0) break
            if (ask.traderId === bid.traderId) continue

            const askRem = askRemaining.get(ask.id) || BigInt(0)
            if (askRem <= 0) continue

            let tradeAmount = bidRem < askRem ? bidRem : askRem
            if (tradeAmount > remainingVolume) tradeAmount = remainingVolume

            matches.push({
                buyOrderId: bid.id,
                buyOnChainId: bid.onChainId?.toString() || "",
                sellOrderId: ask.id,
                sellOnChainId: ask.onChainId?.toString() || "",
                amount: tradeAmount.toString()
            })

            bidRemaining.set(bid.id, bidRem - tradeAmount)
            askRemaining.set(ask.id, askRem - tradeAmount)
            remainingVolume -= tradeAmount
        }
    }

    return {
        marketKey,
        clearingPrice: bestPrice.toString(),
        matchedVolume: bestVolume.toString(),
        matches,
    }
}
