import { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            address: string
            role: string
            companyName: string | null
        } & DefaultSession["user"]
    }

    interface User {
        address: string
        role: string
        companyName: string | null
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        address: string
        role: string
        companyName: string | null
    }
}
