import { SignJWT, jwtVerify, type JWTPayload } from "jose"

const secretKey = process.env.AUTH_SECRET

if (!secretKey || secretKey.length < 32) {
  throw new Error("AUTH_SECRET must be set and at least 32 characters.")
}

const secret = new TextEncoder().encode(secretKey)

export type AuthTokenPayload = JWTPayload & {
  sub: string
  email: string
  role: string
  companyName?: string | null
  walletAddress?: string | null
}

export async function signAuthToken(payload: AuthTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify<AuthTokenPayload>(token, secret)
    return payload
  } catch {
    return null
  }
}
