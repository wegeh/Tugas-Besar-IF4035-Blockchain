import { NextResponse, type NextRequest } from "next/server"
import { verifyAuthToken } from "@/lib/jwt"

const PROTECTED_PATHS = ["/dashboard"]
const AUTH_PATH = "/auth"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isAuthRoute = pathname.startsWith(AUTH_PATH)

  const token = req.cookies.get("cl_session")?.value
  const payload = token ? await verifyAuthToken(token) : null

  if (isProtected && !payload) {
    const url = req.nextUrl.clone()
    url.pathname = AUTH_PATH
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && payload) {
    const url = req.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth"],
}
