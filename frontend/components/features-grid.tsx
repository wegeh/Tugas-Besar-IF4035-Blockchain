"use client"

import { Lock, TrendingUp, CheckCircle2 } from "lucide-react"

export function FeaturesGrid() {
  const features = [
    {
      icon: Lock,
      title: "Immutable Ledger",
      description:
        "Blockchain-backed carbon credits with permanent, tamper-proof records of every transaction and retirement.",
    },
    {
      icon: TrendingUp,
      title: "Real-time MRV",
      description:
        "Measurement, Reporting, and Verification in real-time using IoT sensors and satellite data integration.",
    },
    {
      icon: CheckCircle2,
      title: "Regulatory Compliance",
      description: "Full compliance with Indonesian carbon market regulations and international climate standards.",
    },
  ]

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Why CarbonLedgerID?</h2>
          <p className="text-foreground/70 max-w-2xl mx-auto">
            Built on cutting-edge blockchain technology with rigorous environmental standards.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div key={i} className="glass rounded-xl p-8 group hover:bg-white/[0.08] transition duration-300">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center mb-6 group-hover:from-emerald-500/30 group-hover:to-cyan-500/30 transition">
                <feature.icon className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-foreground/70 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
