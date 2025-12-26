import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { signAuthToken } from "@/lib/jwt"

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not set. Add your Supabase PostgreSQL URL to .env.local." },
      { status: 500 }
    )
  }

  try {
    const body = await req.json()
    const { email, password } = body as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 })
    }

    const token = await signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      walletAddress: user.walletAddress,
    })

    const res = NextResponse.json({
      message: "Authenticated.",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        walletAddress: user.walletAddress,
      },
    })

    res.cookies.set({
      name: "cl_session",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    return res
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Login failed. Check server logs." }, { status: 500 })
  }
}
