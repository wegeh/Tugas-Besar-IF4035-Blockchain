"use client"

import type React from "react"

import { LayoutDashboard, Wallet, ShoppingCart, Leaf, FileText, LogOut } from "lucide-react"
import { useState } from "react"

interface DashboardShellProps {
  children: React.ReactNode
  activeTab: string
  setActiveTab: (tab: string) => void
}

export function DashboardShell({ children, activeTab, setActiveTab }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const menuItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "assets", label: "My Assets", icon: Wallet },
    { id: "marketplace", label: "Marketplace", icon: ShoppingCart },
    { id: "retire", label: "Retire/Surrender", icon: Leaf },
    { id: "audit", label: "Audit Logs", icon: FileText },
  ]

  return (
    <div className="flex h-screen bg-background pt-20">
      {/* Sidebar */}
      <div className={`glass-lg border-r border-white/10 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-20"}`}>
        <div className="p-4 space-y-8">
          {/* User Info */}
          <div className="px-4 py-6 bg-white/5 rounded-lg">
            <p className="text-xs text-foreground/60 mb-1">Company</p>
            <p className="text-sm font-semibold truncate">PT. Energy TBK</p>
            <p className="text-xs text-foreground/40 mt-2 truncate">0x12...89</p>
          </div>

          {/* Menu Items */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                    activeTab === item.id
                      ? "bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400"
                      : "text-foreground/70 hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                </button>
              )
            })}
          </nav>

          {/* Logout */}
          <div className="border-t border-white/10 pt-4">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-foreground/70 hover:text-foreground hover:bg-white/5 transition">
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </div>
    </div>
  )
}
