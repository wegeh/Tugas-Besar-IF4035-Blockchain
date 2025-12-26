"use client"

import { useState } from "react"

interface Stat {
  label: string
  value: string
  unit: string
}

export function LiveStatsTicker() {
  const [stats] = useState<Stat[]>([
    { label: "Total Carbon Retired", value: "2,847,392", unit: "tons CO2e" },
    { label: "Active Projects", value: "156", unit: "verified projects" },
    { label: "Current Carbon Price", value: "$24.50", unit: "per ton" },
  ])

  return (
    <section id="stats" className="py-16 px-4 sm:px-6 lg:px-8 border-y border-white/10">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="glass rounded-lg p-6 text-center group hover:bg-white/10 transition">
              <p className="text-sm text-foreground/60 mb-2">{stat.label}</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                {stat.value}
              </p>
              <p className="text-xs text-foreground/40 mt-2">{stat.unit}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
