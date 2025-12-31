import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OrderStatus, OrderSide, MarketType, AuctionStatus } from "@/src/generated/prisma/enums"

/**
 * GET /api/orders
 * Fetch orders for a specific trader
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get("walletAddress")
    const status = searchParams.get("status")
    const marketKey = searchParams.get("marketKey")

    try {
        const whereClause: any = {}

        if (walletAddress) {
            const user = await prisma.user.findUnique({
                where: { walletAddress: walletAddress.toLowerCase() },
            })
            if (!user) {
                return NextResponse.json({ orders: [] })
            }
            whereClause.traderId = user.id
        }

        if (status) {
            whereClause.status = status
        }

        if (marketKey) {
            whereClause.marketKey = marketKey
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
                auctionWindow: {
                    select: { windowNumber: true, status: true }
                }
            }
        })

        return NextResponse.json({
            orders: orders.map((o) => ({
                id: o.id,
                onChainId: o.onChainId?.toString() || null,
                marketType: o.marketType,
                marketKey: o.marketKey,
                tokenId: o.tokenId,
                periodYear: o.periodYear,
                side: o.side,
                price: o.price,
                amount: o.amount,
                filledAmount: o.filledAmount,
                remaining: (BigInt(o.amount) - BigInt(o.filledAmount)).toString(),
                status: o.status,
                txHash: o.txHash,
                auctionWindow: o.auctionWindow,
                createdAt: o.createdAt.toISOString(),
            })),
        })
    } catch (error) {
        console.error("Orders fetch error:", error)
        return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 })
    }
}

/**
 * POST /api/orders
 * Record a new order (before or after on-chain creation)
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            walletAddress,
            onChainId,
            marketType,
            marketKey,
            tokenId,
            periodYear,
            ptbaeAddress,
            side,
            price,
            amount,
            txHash,
        } = body

        if (!walletAddress || !marketType || !marketKey || !side || !price || !amount) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // Find or create user
        let user = await prisma.user.findUnique({
            where: { walletAddress: walletAddress.toLowerCase() },
        })

        if (!user) {
            user = await prisma.user.create({
                data: {
                    walletAddress: walletAddress.toLowerCase(),
                    role: "COMPANY",
                },
            })
        }

        // Check if market is valid and not expired
        const market = await prisma.market.findUnique({
            where: { marketKey }
        })

        if (!market) {
            return NextResponse.json({ error: "Market not found" }, { status: 404 })
        }

        if (market.expiresAt && new Date() > market.expiresAt) {
            return NextResponse.json({ error: "Market has expired" }, { status: 400 })
        }

        // Dynamic PTBAE Expiration Check (CurrentYear > Period + 2)
        if (market.marketType === "PTBAE" && market.periodYear) {
            const currentYear = new Date().getFullYear()
            if (currentYear > market.periodYear + 2) {
                return NextResponse.json({
                    error: "Market has expired (Saldo Hangus). Trading is no longer allowed."
                }, { status: 400 })
            }
        }

        // Find current open auction window for this market
        const currentWindow = await prisma.auctionWindow.findFirst({
            where: {
                marketKey,
                status: AuctionStatus.OPEN
            }
        })

        // Create order
        const order = await prisma.order.create({
            data: {
                onChainId: onChainId ? BigInt(onChainId) : null,
                marketType: marketType as MarketType,
                marketKey,
                tokenId: tokenId || null,
                periodYear: periodYear ? parseInt(periodYear) : null,
                ptbaeAddress: ptbaeAddress || null,
                side: side as OrderSide,
                price,
                amount,
                filledAmount: "0",
                status: OrderStatus.OPEN,
                traderId: user.id,
                txHash: txHash || null,
                auctionWindowId: currentWindow?.id || null
            },
        })

        return NextResponse.json({
            success: true,
            order: {
                id: order.id,
                onChainId: order.onChainId?.toString() || null,
                auctionWindowId: order.auctionWindowId
            },
        })
    } catch (error) {
        console.error("Order creation error:", error)
        return NextResponse.json({ error: "Failed to create order" }, { status: 500 })
    }
}
