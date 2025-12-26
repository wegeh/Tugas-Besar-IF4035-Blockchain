"use client"

import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Wallet, Shield } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface AuthCardProps {
  role: "regulator" | "company"
  setRole: (role: "regulator" | "company") => void
}

export function AuthCard({ role, setRole }: AuthCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [walletAddress, setWalletAddress] = useState("")
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuth()
  const router = useRouter()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email || !password) {
      toast.error("Email and password are required.")
      return
    }

    if (mode === "register" && role === "company" && (!companyName || !walletAddress)) {
      toast.error("Company name and wallet address are required for company sign up.")
      return
    }

    setLoading(true)
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          role,
          companyName: role === "company" ? companyName : undefined,
          walletAddress: role === "company" ? walletAddress : undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Request failed")
      }

      const user = data.user as {
        id: string
        email: string
        role: string
        companyName?: string | null
        walletAddress?: string | null
      }
      if (user) {
        setUser(user)
      }

      toast.success(data.message || (mode === "login" ? "Signed in successfully." : "Account created successfully."))
      router.push("/dashboard")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

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
          className={`flex-1 py-3 rounded-md font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
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
          className={`flex-1 py-3 rounded-md font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
            role === "regulator"
              ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <Shield className="w-4 h-4" />
          Regulator
        </button>
      </div>

      <form className="space-y-4 mb-6" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium mb-2">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="bg-white/5 border-white/10 placeholder:text-foreground/30"
            required
          />
        </div>

        {role === "company" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Wallet Address</label>
              <Input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="bg-white/5 border-white/10 placeholder:text-foreground/30"
                required={mode === "register"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Company Name</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="PT. Energy Indonesia"
                className="bg-white/5 border-white/10 placeholder:text-foreground/30"
                required={mode === "register"}
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            className="bg-white/5 border-white/10 placeholder:text-foreground/30"
            required
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white glow-green group relative overflow-hidden"
        >
          <span className="relative z-10">
            {loading
              ? "Processing..."
              : mode === "login"
                ? role === "company"
                  ? "Sign In / Simulate Wallet"
                  : "Sign In"
                : "Create Account"}
          </span>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer"></div>
        </Button>
      </form>

      <p className="text-center text-sm text-foreground/60 mt-6">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
        >
          {mode === "login" ? "Create account" : "Sign in"}
        </button>
      </p>
    </div>
  )
}
