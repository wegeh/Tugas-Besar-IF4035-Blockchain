"use client"

import { Toaster } from "sonner"
import { AuthProvider } from "@/lib/auth-context"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}
