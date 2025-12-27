"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "loading") return // Wait for loading

    if (status === "unauthenticated") {
      router.push("/auth")
      return
    }

    if (session?.user?.role === "REGULATOR") {
      router.push("/dashboard/regulator")
    } else if (session?.user?.role === "COMPANY") {
      router.push("/dashboard/company")
    } else {
      // Fallback for unknown role or just generic view if needed? 
      // For now, let's just stay here or redirect to home? 
      // Let's assume there's a generic view or stay on overview.
      // Actually, user complained it looks same. Let's redirect to company as default or stay.
    }
  }, [session, status, router])

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Fallback UI or empty since we redirect
  return <div />
}
