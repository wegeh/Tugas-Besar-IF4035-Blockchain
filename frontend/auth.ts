import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { SiweMessage } from "siwe"
import { prisma } from "@/lib/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            id: "siwe",
            name: "Ethereum",
            credentials: {
                message: { label: "Message", type: "text" },
                signature: { label: "Signature", type: "text" },
            },
            async authorize(credentials) {
                try {
                    console.log("[SIWE] Authorizing with credentials...")
                    if (!credentials?.message || !credentials?.signature) {
                        console.log("[SIWE] Missing message or signature")
                        return null
                    }

                    const siwe = new SiweMessage(credentials.message as string)
                    console.log("[SIWE] Parsed message domain:", siwe.domain)
                    console.log("[SIWE] Parsed message address:", siwe.address)

                    // Verify the signature
                    const result = await siwe.verify({
                        signature: credentials.signature as string,
                    })

                    console.log("[SIWE] Verification success:", result.success)
                    if (!result.success) {
                        console.error("[SIWE] Verification failed error:", result.error)
                        return null
                    }

                    const address = siwe.address.toLowerCase()
                    console.log("[SIWE] Lookup address (lower):", address)

                    // Check if user exists in database
                    // Use findFirst for case-insensitive search to be safe
                    const user = await prisma.user.findFirst({
                        where: {
                            walletAddress: {
                                equals: address,
                                mode: 'insensitive'
                            }
                        },
                    })

                    console.log("[SIWE] User found:", !!user)
                    if (user) console.log("[SIWE] User details:", { id: user.id, role: user.role, wallet: user.walletAddress })

                    if (!user) {
                        return null
                    }

                    return {
                        id: user.id,
                        address: user.walletAddress,
                        role: user.role,
                        companyName: user.companyName,
                    }
                } catch (error) {
                    console.error("[SIWE] Unexpected error in authorize:", error)
                    return null
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.address = user.address
                token.role = user.role
                token.companyName = user.companyName
            }
            return token
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.sub as string
                session.user.address = token.address as string
                session.user.role = token.role as string
                session.user.companyName = token.companyName as string | null
            }
            return session
        },
    },
    pages: {
        signIn: "/auth",
        error: "/auth",
    },
    session: {
        strategy: "jwt",
    },
    trustHost: true,
    // Allow HTTP in development/local production
    useSecureCookies: process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL?.startsWith("https"),
})
