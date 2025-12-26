"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="glass-lg mx-4 mt-4 rounded-full px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
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
            <Button
              size="sm"
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white glow-green group relative overflow-hidden"
            >
              <Wallet className="w-4 h-4 mr-2" />
              <span className="relative z-10">Connect Wallet</span>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer"></div>
            </Button>

            <button onClick={() => setIsOpen(!isOpen)} className="md:hidden">
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
          </div>
        )}
      </div>
    </nav>
  )
}
