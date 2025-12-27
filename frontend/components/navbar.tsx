"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X, Wallet, LogIn, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSession, signOut } from "next-auth/react"
import { useAccount, useDisconnect } from "wagmi"

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { data: session, status } = useSession()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const handleLogout = async () => {
    disconnect()
    await signOut({ callbackUrl: "/" })
  }

  const isLoading = status === "loading"
  const user = session?.user

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="glass-lg mx-4 mt-4 rounded-full px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 bg-linear-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <span className="text-white">C</span>
            </div>
            <span className="hidden sm:inline">CarbonLedgerID</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-foreground/70 hover:text-foreground transition">
              Features
            </Link>
            <Link href="#stats" className="text-sm text-foreground/70 hover:text-foreground transition">
              Stats
            </Link>
            <Link href="#marketplace" className="text-sm text-foreground/70 hover:text-foreground transition">
              Marketplace
            </Link>
          </div>

          {/* CTA Button */}
          <div className="flex items-center gap-4">
            {/* Wallet Display (if connected) */}
            {isConnected && address && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-mono text-emerald-400">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
            )}

            {!isLoading && user ? (
              <>
                <span className="hidden sm:inline text-sm text-foreground/70">
                  {user.companyName || user.role}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 hover:bg-white/5 bg-transparent"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-linear-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white glow-green group relative overflow-hidden"
                >
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">Dashboard</span>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer"></div>
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/20 hover:bg-white/5 bg-transparent"
                >
                  <Link href="/auth" className="flex items-center gap-2">
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-linear-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white glow-green group relative overflow-hidden"
                >
                  <Link href="/auth" className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 relative z-10" />
                    <span className="relative z-10">Launch App</span>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer"></div>
                  </Link>
                </Button>
              </>
            )}

            <button onClick={() => setIsOpen(!isOpen)} className="md:hidden cursor-pointer">
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/10 space-y-4">
            <Link href="#features" className="block text-sm text-foreground/70 hover:text-foreground">
              Features
            </Link>
            <Link href="#stats" className="block text-sm text-foreground/70 hover:text-foreground">
              Stats
            </Link>
            <Link href="#marketplace" className="block text-sm text-foreground/70 hover:text-foreground">
              Marketplace
            </Link>
            {user ? (
              <>
                <Link href="/dashboard" className="block text-sm text-foreground/70 hover:text-foreground">
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="block text-left w-full text-sm text-foreground/70 hover:text-foreground cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link href="/auth" className="block text-sm text-foreground/70 hover:text-foreground">
                Sign In
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
