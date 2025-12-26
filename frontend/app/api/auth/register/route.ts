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
    const { email, password, role, companyName, walletAddress } = body as {
      email?: string
      password?: string
      role?: string
      companyName?: string
      walletAddress?: string
    }

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Email, password, and role are required." }, { status: 400 })
    }

    const normalizedRole = role === "company" ? "COMPANY" : role === "regulator" ? "REGULATOR" : null
    if (!normalizedRole) {
      return NextResponse.json({ error: "Role must be company or regulator." }, { status: 400 })
    }

    if (normalizedRole === "COMPANY" && (!companyName || !walletAddress)) {
      return NextResponse.json(
        { error: "Company name and wallet address are required for company accounts." },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "User already exists." }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: normalizedRole,
        companyName,
        walletAddress,
      },
    })

    const token = await signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      walletAddress: user.walletAddress,
    })

    const res = NextResponse.json({
      message: "Account created.",
      user: { id: user.id, email: user.email, role: user.role, companyName: user.companyName, walletAddress },
    })

    res.cookies.set({
      name: "cl_session",
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })

    return res
  } catch (error) {
    console.error("Register error:", error)
    return NextResponse.json({ error: "Registration failed. Check server logs." }, { status: 500 })
  }
}
