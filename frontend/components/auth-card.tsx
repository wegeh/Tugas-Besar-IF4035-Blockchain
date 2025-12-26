"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Wallet, Shield } from "lucide-react"

interface AuthCardProps {
  role: "regulator" | "company"
  setRole: (role: "regulator" | "company") => void
}

export function AuthCard({ role, setRole }: AuthCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="glass-lg rounded-2xl p-8 max-w-md w-full transition-all duration-300"
      style={{
        transform: isHovered ? "perspective(1000px) rotateX(2deg) rotateY(-2deg)" : "none",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">CarbonLedgerID</h1>
        <p className="text-foreground/60">Choose your role to continue</p>
      </div>

      {/* Role Toggle */}
      <div className="bg-white/5 rounded-lg p-1 flex gap-1 mb-8">
        <button
          onClick={() => setRole("company")}
          className={`flex-1 py-3 rounded-md font-medium transition flex items-center justify-center gap-2 ${
            role === "company"
              ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <Wallet className="w-4 h-4" />
          Company
        </button>
        <button
          onClick={() => setRole("regulator")}
          className={`flex-1 py-3 rounded-md font-medium transition flex items-center justify-center gap-2 ${
            role === "regulator"
              ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <Shield className="w-4 h-4" />
          Regulator
        </button>
      </div>

      {/* Form Content */}
      <div className="space-y-4 mb-6">
        {role === "company" ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Wallet Address</label>
              <Input placeholder="0x..." className="bg-white/5 border-white/10 placeholder:text-foreground/30" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Company Name</label>
              <Input
                placeholder="PT. Energy Indonesia"
                className="bg-white/5 border-white/10 placeholder:text-foreground/30"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <Input
                type="email"
                placeholder="regulator@gov.id"
                className="bg-white/5 border-white/10 placeholder:text-foreground/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                className="bg-white/5 border-white/10 placeholder:text-foreground/30"
              />
            </div>
          </>
        )}
      </div>

      <Button className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white glow-green group relative overflow-hidden">
        <span className="relative z-10">{role === "company" ? "Connect Wallet" : "Sign In"}</span>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer"></div>
      </Button>

      <p className="text-center text-sm text-foreground/60 mt-6">
        New here? <span className="text-emerald-400 hover:text-emerald-300 cursor-pointer">Create account</span>
      </p>
    </div>
  )
}
