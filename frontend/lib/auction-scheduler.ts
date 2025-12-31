import { ethers } from "ethers"
import { prisma } from "@/lib/prisma"
import { AuctionStatus } from "@/src/generated/prisma/enums"
import ExchangeABI from "@/abi/CarbonExchange.json"
import Addresses from "@/abi/addresses.local.json"

// Config - Hardcoded for Local Dev as per request
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545"
const MATCHER_PRIVATE_KEY = process.env.MATCHER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const EXCHANGE_ADDRESS = Addresses.CarbonExchange.address
const API_BASE = "http://127.0.0.1:3000" // Internal call

let isRunning = false

/**
 * Convert human-readable marketKey to on-chain bytes32 hash
 * DB: "SPE-123" or "PTBAE-2024"
 * Contract: keccak256(abi.encode("SPE", tokenId)) or keccak256(abi.encode("PTBAE", period))
 */
function getOnChainMarketKey(marketKey: string): string {
    const coder = ethers.AbiCoder.defaultAbiCoder()

    if (marketKey.startsWith("SPE-")) {
        const tokenId = marketKey.substring(4) // Remove "SPE-"
        return ethers.keccak256(coder.encode(["string", "uint256"], ["SPE", BigInt(tokenId)]))
    } else if (marketKey.startsWith("PTBAE-")) {
        const period = parseInt(marketKey.substring(6)) // Remove "PTBAE-"
        return ethers.keccak256(coder.encode(["string", "uint32"], ["PTBAE", period]))
    }

    // Fallback: assume it's already a hash
    return marketKey
}

export async function initAuctionScheduler() {
    if (isRunning) return
    isRunning = true
    console.log("[Scheduler] Auction Scheduler Started")

    // Run immediately then loop
    checkAndSettle()
    setInterval(checkAndSettle, 10000) // Check every 10s
}

async function checkAndSettle() {
    try {
        // 1. Get all OPEN windows that have expired
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

        // Setup Ethers
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
        // 1. Calculate Matches via API (reusing existing Match Logic)
        const matchRes = await fetch(`${API_BASE}/api/match`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ marketKey })
        })

        if (!matchRes.ok) {
            console.error(`[Scheduler] Failed to get matches for ${marketKey}`)
            return
        }

        const matchData = await matchRes.json()
        const matches = matchData.matches || []

        // Use clearing price from API or fallback to base price
        let clearingPrice = matchData.clearingPrice || window.market.basePrice
        let settlementSuccess = false

        if (matches.length > 0) {
            console.log(`[Scheduler] Found ${matches.length} matches at clearing price ${clearingPrice}`)

            // 2. Submit Settlement On-Chain
            console.log(`[Scheduler] Submitting batch settlement for ${marketKey}...`)
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
                console.log(`[Scheduler] Skipping DB update due to on-chain failure`)
            }

            // 3. Update Order Statuses in DB (ONLY if on-chain succeeded)
            if (settlementSuccess && txHash) {
                for (const match of matches) {
                    // Get current orders to calculate new filledAmount
                    const buyOrder = await prisma.order.findUnique({ where: { id: match.buyOrderId } })
                    const sellOrder = await prisma.order.findUnique({ where: { id: match.sellOrderId } })

                    if (buyOrder) {
                        const newBuyFilled = (BigInt(buyOrder.filledAmount) + BigInt(match.amount)).toString()
                        await prisma.order.update({
                            where: { id: match.buyOrderId },
                            data: {
                                status: "FILLED" as any,
                                filledAmount: newBuyFilled
                            }
                        })
                    }

                    if (sellOrder) {
                        const newSellFilled = (BigInt(sellOrder.filledAmount) + BigInt(match.amount)).toString()
                        await prisma.order.update({
                            where: { id: match.sellOrderId },
                            data: {
                                status: "FILLED" as any,
                                filledAmount: newSellFilled
                            }
                        })
                    }

                    // --- RECORD TRADE HISTORY ---
                    await prisma.trade.create({
                        data: {
                            marketKey: marketKey,
                            buyOrderId: match.buyOrderId,
                            sellOrderId: match.sellOrderId,
                            price: clearingPrice.toString(),
                            amount: match.amount.toString(),
                            txHash: txHash
                            // executedAt is default now()
                        }
                    })
                }
                console.log(`[Scheduler] Marked ${matches.length * 2} orders as FILLED and recorded TRADES in DB`)
            }
        } else {
            console.log(`[Scheduler] No matches found. Pricing at ${clearingPrice}`)
        }

        // 4. Cancel ALL orders in this window to refund remaining escrow
        const allWindowOrders = await prisma.order.findMany({
            where: {
                marketKey,
                status: { in: ["OPEN", "FILLED"] as any[] }
            },
            select: { id: true, onChainId: true, status: true, amount: true, filledAmount: true }
        })

        // Filter orders that have remaining escrow (not fully filled or unmatched)
        const ordersWithRemainingEscrow = allWindowOrders.filter(o => {
            const remaining = BigInt(o.amount) - BigInt(o.filledAmount)
            return remaining > 0 && o.onChainId !== null
        })

        if (ordersWithRemainingEscrow.length > 0) {
            const onChainIds = ordersWithRemainingEscrow.map(o => o.onChainId!.toString())

            try {
                console.log(`[Scheduler] Calling batchCancelOrders for ${onChainIds.length} orders to refund remaining escrow...`)
                const cancelTx = await exchangeContract.batchCancelOrders(onChainIds)
                await cancelTx.wait()
                console.log(`[Scheduler] On-chain refunds completed for remaining escrow`)
            } catch (cancelErr: any) {
                console.error(`[Scheduler] batchCancelOrders failed: ${cancelErr.message}`)
            }
        }

        // Update DB status - mark all orders as appropriate status
        // OPEN orders become CANCELLED, FILLED orders stay FILLED (partial fill is still considered filled)
        const openOrderIds = allWindowOrders.filter(o => o.status === "OPEN").map(o => o.id)
        if (openOrderIds.length > 0) {
            await prisma.order.updateMany({
                where: { id: { in: openOrderIds } },
                data: { status: "CANCELLED" as any }
            })
            console.log(`[Scheduler] Cancelled ${openOrderIds.length} unmatched orders (Order Book Cleared)`)
        }

        // 5. Update DB (Rotate Window)
        // Mark current as SETTLED
        await prisma.auctionWindow.update({
            where: { id: window.id },
            data: { status: AuctionStatus.SETTLED }
        })

        // Create NEXT Window (Clock Aligned)
        const durationMinutes = parseInt(process.env.AUCTION_DURATION_MINUTES || "2")
        const now = new Date()
        const durationMs = durationMinutes * 60 * 1000

        // Calculate next boundary (Epoch alignment works for full-hour timezones like WIB)
        const currentMs = now.getTime()
        let nextEndMs = Math.ceil(currentMs / durationMs) * durationMs

        // Ensure minimum window of 30s, otherwise push to next interval
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

        // Update Market Clearing Price
        await prisma.market.update({
            where: { marketKey },
            data: { lastClearingPrice: clearingPrice }
        })

        console.log(`[Scheduler] Window Rotated. Next Window #${window.windowNumber + 1} Ends: ${endTime.toLocaleTimeString()}`)

    } catch (e: any) {
        console.error(`[Scheduler] Settlement Error for ${marketKey}:`, e.message)
    }
}
