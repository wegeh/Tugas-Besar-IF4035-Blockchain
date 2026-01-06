import { ethers } from "ethers"
import { prisma } from "@/lib/prisma"
import { AuctionStatus } from "@/src/generated/prisma/enums"
import ExchangeABI from "@/abi/CarbonExchange.json"
import Addresses from "@/abi/addresses.local.json"
import { calculateMatches } from "@/lib/matcher"

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545"
const MATCHER_PRIVATE_KEY = process.env.MATCHER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const EXCHANGE_ADDRESS = Addresses.CarbonExchange.address

let isRunning = false

function getOnChainMarketKey(marketKey: string): string {
    const coder = ethers.AbiCoder.defaultAbiCoder()

    if (marketKey.startsWith("SPE-")) {
        const tokenId = marketKey.substring(4)
        return ethers.keccak256(coder.encode(["string", "uint256"], ["SPE", BigInt(tokenId)]))
    } else if (marketKey.startsWith("PTBAE-")) {
        const period = parseInt(marketKey.substring(6))
        return ethers.keccak256(coder.encode(["string", "uint32"], ["PTBAE", period]))
    }

    return marketKey
}

export async function initAuctionScheduler() {
    if (isRunning) return
    isRunning = true
    console.log("[Scheduler] Auction Scheduler Started")

    checkAndSettle()
    setInterval(checkAndSettle, 10000)
}

async function checkAndSettle() {
    try {
        const now = new Date()
        const expiredWindows = await prisma.auctionWindow.findMany({
            where: {
                status: AuctionStatus.OPEN,
                endTime: { lt: now }
            },
            include: { market: true }
        })

        if (expiredWindows.length === 0) return

        console.log(`[Scheduler] Found ${expiredWindows.length} expired windows. Settling...`)

        const provider = new ethers.JsonRpcProvider(RPC_URL)
        const wallet = new ethers.Wallet(MATCHER_PRIVATE_KEY, provider)
        const exchangeContract = new ethers.Contract(EXCHANGE_ADDRESS, ExchangeABI.abi, wallet)

        for (const window of expiredWindows) {
            await settleWindow(window, exchangeContract)
        }

    } catch (error) {
        console.error("[Scheduler] Error:", error)
    }
}

async function settleWindow(window: any, exchangeContract: any) {
    const marketKey = window.marketKey
    console.log(`[Scheduler] Settling ${marketKey} (Window #${window.windowNumber})`)

    try {
        let matches: any[] = []
        let clearingPrice = window.market?.basePrice || "0"

        try {
            const matchResult = await calculateMatches(marketKey)
            matches = matchResult.matches || []
            clearingPrice = matchResult.clearingPrice || window.market?.basePrice || "0"
        } catch (matchErr: any) {
            console.error(`[Scheduler] Matcher Error: ${matchErr.message}`)
        }

        let settlementSuccess = false

        if (matches.length > 0) {
            console.log(`[Scheduler] Found ${matches.length} matches at clearing price ${clearingPrice}`)

            const buyOrderIds = matches.map((m: any) => m.buyOnChainId)
            const sellOrderIds = matches.map((m: any) => m.sellOnChainId)
            const amounts = matches.map((m: any) => m.amount)
            let txHash = ""

            try {
                if (buyOrderIds.length !== sellOrderIds.length) throw new Error("Mismatch IDs")

                const onChainMarketKey = getOnChainMarketKey(marketKey)

                const tx = await exchangeContract.settleBatch(
                    onChainMarketKey,
                    clearingPrice,
                    buyOrderIds,
                    sellOrderIds,
                    amounts
                )
                console.log(`[Scheduler] Tx Sent: ${tx.hash}`)
                await tx.wait()
                console.log(`[Scheduler] On-Chain Settlement Confirmed`)
                txHash = tx.hash
                settlementSuccess = true
            } catch (err: any) {
                console.error(`[Scheduler] On-Chain Failed: ${err.message}`)
            }

            if (settlementSuccess && txHash) {
                for (const match of matches) {
                    const buyOrder = await prisma.order.findUnique({ where: { id: match.buyOrderId } })
                    const sellOrder = await prisma.order.findUnique({ where: { id: match.sellOrderId } })

                    if (buyOrder) {
                        const newBuyFilled = (BigInt(buyOrder.filledAmount) + BigInt(match.amount)).toString()
                        await prisma.order.update({
                            where: { id: match.buyOrderId },
                            data: { status: "FILLED" as any, filledAmount: newBuyFilled }
                        })
                    }

                    if (sellOrder) {
                        const newSellFilled = (BigInt(sellOrder.filledAmount) + BigInt(match.amount)).toString()
                        await prisma.order.update({
                            where: { id: match.sellOrderId },
                            data: { status: "FILLED" as any, filledAmount: newSellFilled }
                        })
                    }

                    await prisma.trade.create({
                        data: {
                            marketKey: marketKey,
                            buyOrderId: match.buyOrderId,
                            sellOrderId: match.sellOrderId,
                            price: clearingPrice.toString(),
                            amount: match.amount.toString(),
                            txHash: txHash
                        }
                    })
                }
                console.log(`[Scheduler] Marked ${matches.length * 2} orders as FILLED and recorded TRADES in DB`)
            }
        } else {
            console.log(`[Scheduler] No matches found. Pricing at ${clearingPrice}`)
        }

        const allWindowOrders = await prisma.order.findMany({
            where: {
                marketKey,
                status: { in: ["OPEN", "FILLED"] as any[] }
            },
            select: { id: true, onChainId: true, status: true, amount: true, filledAmount: true }
        })

        const ordersWithRemainingEscrow = allWindowOrders.filter(o => {
            const remaining = BigInt(o.amount) - BigInt(o.filledAmount)
            return remaining > 0 && o.onChainId !== null
        })

        if (ordersWithRemainingEscrow.length > 0) {
            const onChainIds = ordersWithRemainingEscrow.map(o => o.onChainId!.toString())

            try {
                const cancelTx = await exchangeContract.batchCancelOrders(onChainIds)
                await cancelTx.wait()
                console.log(`[Scheduler] Refunded ${onChainIds.length} orders with remaining escrow`)
            } catch (cancelErr: any) {
                console.error(`[Scheduler] batchCancelOrders failed: ${cancelErr.message}`)
            }
        }

        const openOrderIds = allWindowOrders.filter(o => o.status === "OPEN").map(o => o.id)
        if (openOrderIds.length > 0) {
            await prisma.order.updateMany({
                where: { id: { in: openOrderIds } },
                data: { status: "CANCELLED" as any }
            })
            console.log(`[Scheduler] Cancelled ${openOrderIds.length} unmatched orders`)
        }

        await prisma.auctionWindow.update({
            where: { id: window.id },
            data: { status: AuctionStatus.SETTLED }
        })

        const durationMinutes = parseInt(process.env.AUCTION_DURATION_MINUTES || "2")
        const now = new Date()
        const durationMs = durationMinutes * 60 * 1000

        const currentMs = now.getTime()
        let nextEndMs = Math.ceil(currentMs / durationMs) * durationMs

        if (nextEndMs - currentMs < 30000) {
            nextEndMs += durationMs
        }

        const startTime = now
        const endTime = new Date(nextEndMs)

        await prisma.auctionWindow.create({
            data: {
                marketKey: marketKey,
                windowNumber: window.windowNumber + 1,
                startTime: startTime,
                endTime: endTime,
                status: AuctionStatus.OPEN
            }
        })

        await prisma.market.update({
            where: { marketKey },
            data: { lastClearingPrice: clearingPrice }
        })

        console.log(`[Scheduler] Window Rotated. Next Window #${window.windowNumber + 1} Ends: ${endTime.toLocaleTimeString()}`)

    } catch (e: any) {
        console.error(`[Scheduler] Settlement Error for ${marketKey}:`, e.message)
        try {
            await prisma.auctionWindow.update({
                where: { id: window.id },
                data: { status: AuctionStatus.SETTLED }
            })
            console.log(`[Scheduler] Emergency window close successful`)
        } catch (closeErr: any) {
            console.error(`[Scheduler] Emergency close failed: ${closeErr.message}`)
        }
    }
}
