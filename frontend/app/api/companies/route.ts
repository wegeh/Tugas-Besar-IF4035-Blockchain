import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Role } from "@/src/generated/prisma/client"

// GET /api/companies
// Query params:
//   - allocated=true&year=X  → Get allocated companies for year
//   - allocated=false&year=X → Get unallocated companies for year
//   - (no params)            → Get all registered companies
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const allocated = searchParams.get("allocated")
        const yearStr = searchParams.get("year")

        // If filtering by allocation status
        if (allocated !== null && yearStr) {
            const year = parseInt(yearStr, 10)
            if (isNaN(year)) {
                return NextResponse.json({ error: "Invalid year" }, { status: 400 })
            }

            if (allocated === "true") {
                // Get allocated companies for this year
                const allocations = await prisma.allocation.findMany({
                    where: { periodYear: year },
                    include: {
                        company: {
                            select: {
                                id: true,
                                companyName: true,
                                walletAddress: true,
                                email: true
                            }
                        }
                    },
                    orderBy: { createdAt: "desc" }
                })
                return NextResponse.json(allocations)
            } else {
                // Get unallocated companies for this year
                const allCompanies = await prisma.user.findMany({
                    where: { role: Role.COMPANY },
                    select: {
                        id: true,
                        walletAddress: true,
                        companyName: true,
                        email: true,
                        allocations: {
                            where: { periodYear: year },
                            select: { id: true }
                        }
                    }
                })

                const unallocated = allCompanies
                    .filter(c => c.allocations.length === 0)
                    .map(({ allocations, ...company }) => company)

                return NextResponse.json(unallocated)
            }
        }

        // Default: Get all registered companies
        const companies = await prisma.user.findMany({
            where: { role: Role.COMPANY },
            select: {
                id: true,
                walletAddress: true,
                companyName: true,
                email: true
            },
            orderBy: { companyName: "asc" }
        })

        return NextResponse.json(companies.map(c => ({
            walletAddress: c.walletAddress,
            companyName: c.companyName || "Unknown Company",
            email: c.email || ""
        })))
    } catch (error) {
        console.error("Failed to fetch companies:", error)
        return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 })
    }
}
