import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AuctionStatus } from "@/src/generated/prisma/enums"
import { openNewAuctionWindow } from "../route"

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { marketKey, completedWindowId, clearingPrice } = body

        if (!marketKey || !completedWindowId) {
            return NextResponse.json({ error: "Missing marketKey or completedWindowId" }, { status: 400 })
        }

        // 1. Close the old window
        // We trust the auction-service to have settled it.
        // We update the DB status and clearing price.
        await prisma.auctionWindow.update({
            where: { id: completedWindowId },
            data: {
                status: AuctionStatus.CLOSED,
                clearingPrice: clearingPrice ? clearingPrice.toString() : null,
                // We could calculate total volume here or accept it from body if sent
                // For now, let's leave volume as is or calculate it if needed. 
                // The closeAuctionWindow helper calculates it, but here we are just finalizing what the service did.
            }
        })

        // 2. Open new window (Hardcoded 2 minutes as requested)
        return await openNewAuctionWindow(marketKey, 2)

    } catch (error) {
        console.error("Rotate error:", error)
        return NextResponse.json({ error: "Failed to rotate window" }, { status: 500 })
    }
}
