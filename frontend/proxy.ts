import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

const PROTECTED_PATHS = ["/dashboard"]
const AUTH_PATH = "/auth"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isAuthRoute = pathname.startsWith(AUTH_PATH)

  // Get NextAuth session
  const session = await auth()

  if (isProtected && !session) {
    const url = req.nextUrl.clone()
    url.pathname = AUTH_PATH
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && session) {
    const url = req.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
}
