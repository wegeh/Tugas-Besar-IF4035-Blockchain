"use client"

import { useEffect, useState } from "react"
import { TokenCard } from "@/components/token-card"
import { Card } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { getCompliance, getSpeSnapshot } from "@/lib/reads"
import addresses from "@/abi/addresses.local.json"

const chartData = [
  { month: "Jan", emissions: 4200, offsets: 2400 },
  { month: "Feb", emissions: 3800, offsets: 2210 },
  { month: "Mar", emissions: 5200, offsets: 2290 },
  { month: "Apr", emissions: 4500, offsets: 2000 },
  { month: "May", emissions: 4800, offsets: 2181 },
  { month: "Jun", emissions: 5100, offsets: 2500 },
]

export function OverviewTab() {
  const [account, setAccount] = useState<string>("")
  const [speBalance, setSpeBalance] = useState<number | undefined>(undefined)
  const [speTotal, setSpeTotal] = useState<number | undefined>(undefined)
  const [ptbaeUsed, setPtbaeUsed] = useState<number | undefined>(undefined)
  const [ptbaeTotal, setPtbaeTotal] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError("")
      try {
        // Resolve account (use connected wallet if present, otherwise fallback to deployer)
        let addr = addresses.SPEGRKToken?.initialHolder || ""
        if (typeof window !== "undefined" && (window as any).ethereum) {
          const accounts = await (window as any).ethereum.request?.({ method: "eth_accounts" })
          if (accounts && accounts.length > 0) {
            addr = accounts[0]
          }
        }
        if (!addr) throw new Error("No account available. Connect a wallet.")

        const tokenId = 1
        const spe = await getSpeSnapshot(tokenId, addr)
        const comp = await getCompliance(addr)

        if (cancelled) return
        setAccount(addr)
        setSpeBalance(Number(spe.balance))
        setSpeTotal(Number(spe.supply))
        setPtbaeUsed(Number(comp.surrendered))
        setPtbaeTotal(Number(comp.balance))
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load balances")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const speDisplayBalance = loading ? undefined : speBalance
  const ptbaeUsedDisplay = loading ? undefined : ptbaeUsed
  const ptbaeTotalDisplay = loading ? undefined : ptbaeTotal

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold mb-2">Welcome back!</h1>
        <p className="text-foreground/60">
          Active account: {account ? account : "No wallet connected"}
          {error && <span className="text-red-400 ml-2">({error})</span>}
        </p>
      </div>

      {/* Token Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TokenCard
          title="SPE-GRK Credits"
          type="ERC-1155"
          quantity={speDisplayBalance}
          tokenId={1}
          vintage="2024"
          projectId="PRJ-2024-001"
          badge="Verified"
          badgeColor="emerald"
        />
        <TokenCard
          title="PTBAE-PU Allowance"
          type="ERC-20"
          used={ptbaeUsedDisplay}
          total={ptbaeTotalDisplay}
          tokenId={1}
          badge="Active"
          badgeColor="cyan"
          isAllowance
        />
      </div>

      {/* Chart */}
      <Card className="glass border-white/10 p-6">
        <h3 className="text-lg font-semibold mb-6">Emissions vs. Offsets</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="month" stroke="rgba(255,255,255,0.6)" />
            <YAxis stroke="rgba(255,255,255,0.6)" />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
              }}
            />
            <Line type="monotone" dataKey="emissions" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="offsets" stroke="#06b6d4" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
