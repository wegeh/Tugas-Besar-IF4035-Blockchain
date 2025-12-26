import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { verifyAuthToken } from "@/lib/jwt"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("cl_session")?.value
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  const payload = await verifyAuthToken(token)
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  return NextResponse.json({
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      companyName: payload.companyName ?? null,
      walletAddress: payload.walletAddress ?? null,
    },
  })
}
