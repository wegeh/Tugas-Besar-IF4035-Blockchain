"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  const floatingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = floatingRef.current
    if (!element) return

    let animationId: number
    let time = 0

    const animate = () => {
      time += 0.005
      const y = Math.sin(time) * 20
      const x = Math.cos(time * 0.7) * 10
      element.style.transform = `translateY(${y}px) translateX(${x}px)`
      animationId = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animationId)
  }, [])

  return (
    <section className="min-h-screen flex items-center justify-center pt-20 px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center max-w-6xl w-full">
        {/* Left Content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold text-balance leading-tight">Trust in Every Ton.</h1>
            <h2 className="text-3xl sm:text-4xl font-light text-foreground/80">
              The Future of Indonesia's Carbon Market
            </h2>
          </div>

          <p className="text-lg text-foreground/70 max-w-lg">
            Immutable ledger technology ensuring every carbon credit is verified, traceable, and sustainable.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white glow-green group relative overflow-hidden"
            >
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="relative z-10">Explore Dashboard</span>
                <ArrowRight className="w-5 h-5 relative z-10" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer"></div>
              </Link>
            </Button>

            <Button size="lg" variant="outline" asChild className="border-white/20 hover:bg-white/5 bg-transparent">
              <Link href="/auth">Sign In / Register</Link>
            </Button>
          </div>
        </div>

        {/* Right Visual - Abstract Carbon Globe */}
        <div className="flex items-center justify-center">
          <div ref={floatingRef} className="relative w-64 h-64 sm:w-80 sm:h-80">
            {/* Central sphere with gradient */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-500/30 via-cyan-500/20 to-transparent blur-3xl"></div>

            {/* Orbiting rings */}
            <div
              className="absolute inset-0 rounded-full border border-emerald-500/20 animate-spin"
              style={{ animationDuration: "20s" }}
            ></div>
            <div
              className="absolute inset-4 rounded-full border border-cyan-500/10 animate-spin"
              style={{ animationDuration: "-30s" }}
            ></div>
            <div className="absolute inset-8 rounded-full border border-emerald-500/5"></div>

            {/* Center core */}
            <div className="absolute inset-1/3 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-2xl shadow-emerald-500/50"></div>

            {/* Accent particles */}
            <div className="absolute top-0 left-1/2 w-3 h-3 bg-emerald-400 rounded-full blur-sm shadow-lg shadow-emerald-500/50"></div>
            <div className="absolute bottom-1/3 right-0 w-2 h-2 bg-cyan-400 rounded-full blur-sm shadow-lg shadow-cyan-500/30"></div>
          </div>
        </div>
      </div>
    </section>
  )
}
