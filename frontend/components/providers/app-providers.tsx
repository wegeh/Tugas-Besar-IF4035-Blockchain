"use client"

import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/sonner"
import { wagmiConfig } from "@/lib/wagmi-config"

const queryClient = new QueryClient()

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          {children}
          <Toaster />
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
