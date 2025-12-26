"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowUpRight, Send, History } from "lucide-react"
import { toast } from "sonner"
import { useContractActions } from "@/hooks/use-contract-actions"

interface TokenCardProps {
  title: string
  type: string
  quantity?: number
  tokenId?: number
  vintage?: string
  projectId?: string
  used?: number
  total?: number
  badge: string
  badgeColor: "emerald" | "cyan"
  isAllowance?: boolean
}

export function TokenCard({
  title,
  type,
  quantity,
  tokenId,
  vintage,
  projectId,
  used,
  total,
  badge,
  badgeColor,
  isAllowance,
}: TokenCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const { transferSPE, retireSPE, transferPTBAE, surrenderPTBAE, state } = useContractActions()

  const badgeColors = {
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  }

  const actionPrimaryLabel = isAllowance ? "Transfer" : "Transfer"
  const actionSecondaryLabel = isAllowance ? "Surrender" : "Retire"

  const handleTransfer = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const to = window.prompt("Destination address?")
    if (!to) return
    const amountStr = window.prompt("Amount?")
    if (!amountStr) return
    const amount = BigInt(amountStr)
    try {
      if (isAllowance) {
        await transferPTBAE(to, amount)
      } else {
        const id = tokenId ?? Number(window.prompt("Token ID?", "1"))
        await transferSPE(id, to, amount)
      }
    } catch (err: any) {
      toast.error(err?.message || "Transfer failed")
    }
  }

  const handleSecondary = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const amountStr = window.prompt("Amount?")
    if (!amountStr) return
    const amount = BigInt(amountStr)
    try {
      if (isAllowance) {
        await surrenderPTBAE(amount)
      } else {
        const id = tokenId ?? Number(window.prompt("Token ID?", "1"))
        await retireSPE(id, amount)
      }
    } catch (err: any) {
      toast.error(err?.message || "Action failed")
    }
  }

  const handleHistory = (e: React.MouseEvent) => {
    e.stopPropagation()
    toast.info("History view not implemented yet.")
  }

  return (
    <Card
      className="glass border-white/10 p-8 cursor-pointer group relative overflow-hidden h-64"
      onClick={() => setIsFlipped(!isFlipped)}
      style={{ perspective: "1200px" }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-300 shimmer pointer-events-none"></div>

      <div
        className="relative z-10 h-full w-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col justify-between"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(0deg)" }}
        >
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-xs text-foreground/60 mt-1">{type}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeColors[badgeColor]}`}>
                {badge}
              </div>
            </div>

            {isAllowance ? (
              <div>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-foreground/60">Usage</span>
                    <span className="font-medium">
                      {used?.toLocaleString("en-US")} / {total?.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                      style={{ width: `${((used || 0) / (total || 1)) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <p className="text-xs text-foreground/60">
                  {total && used ? `${((used / total) * 100).toFixed(1)}% used` : "Usage"}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-3xl font-bold mb-2">{quantity?.toLocaleString("en-US")}</p>
                <div className="grid grid-cols-2 gap-4 text-xs text-foreground/60">
                  <div>
                    <span className="block text-foreground/40">Project ID</span>
                    <span className="font-mono">{projectId}</span>
                  </div>
                  <div>
                    <span className="block text-foreground/40">Vintage</span>
                    <span>{vintage}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-foreground/40">Click to see actions &rarr;</p>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col justify-between"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="space-y-3">
            <h4 className="font-semibold mb-4">Quick Actions</h4>
            <Button
              size="sm"
              disabled={state === "pending"}
              className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
              onClick={handleTransfer}
            >
              <Send className="w-4 h-4 mr-2" />
              {actionPrimaryLabel}
            </Button>
            <Button
              size="sm"
              disabled={state === "pending"}
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30"
              onClick={handleSecondary}
            >
              <ArrowUpRight className="w-4 h-4 mr-2" />
              {actionSecondaryLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={state === "pending"}
              className="w-full border-white/20 hover:bg-white/5 bg-transparent"
              onClick={handleHistory}
            >
              <History className="w-4 h-4 mr-2" />
              History
            </Button>
          </div>
          <p className="text-xs text-foreground/40">Click to go back</p>
        </div>
      </div>
    </Card>
  )
}
