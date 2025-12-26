"use client"

import { useState } from "react"
import { AuthCard } from "@/components/auth-card"

export default function AuthPage() {
  const [role, setRole] = useState<"regulator" | "company">("company")

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <AuthCard role={role} setRole={setRole} />
    </div>
  )
}
