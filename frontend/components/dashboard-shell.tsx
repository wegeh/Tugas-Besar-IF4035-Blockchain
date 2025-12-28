"use client"

import type React from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { LayoutDashboard, Wallet, ShoppingCart, Leaf, FileText, LogOut } from "lucide-react"
import { useState } from "react"

export interface MenuItem {
  id: string
  label: string
  icon: any
  href?: string
}

interface DashboardShellProps {
  children: React.ReactNode
  activeTab?: string
  setActiveTab?: (tab: string) => void
  menuItems: MenuItem[]
}

export function DashboardShell({ children, activeTab, setActiveTab, menuItems }: DashboardShellProps) {
  const { data: session } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-background pt-20">
      {/* Sidebar */}
      <div className={`glass-lg border-r border-white/10 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-16 md:w-64"}`}>
        <div className="p-4 space-y-8">
          {/* User Info */}
          <div className={`px-4 py-6 bg-white/5 rounded-lg ${!sidebarOpen && "hidden md:block"}`}>
            <p className="text-xs text-foreground/60 mb-1">{session?.user?.role || "User"}</p>
            <p className="text-sm font-semibold truncate">{session?.user?.companyName || "No Name"}</p>
            <p className="text-xs text-foreground/40 mt-2 truncate">
              {session?.user?.address ? `${session.user.address.slice(0, 6)}...${session.user.address.slice(-4)}` : "Not connected"}
            </p>
          </div>

          {/* Menu Items */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = item.href
                ? pathname === item.href
                : activeTab === item.id

              const className = `w-full flex items-center gap-3 px-4 py-3 rounded-lg transition cursor-pointer ${isActive
                  ? "bg-linear-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400"
                  : "text-foreground/70 hover:text-foreground hover:bg-white/5"
                }`

              if (item.href) {
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={className}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className={`${!sidebarOpen ? "hidden md:inline" : "inline"} text-sm font-medium`}>
                      {item.label}
                    </span>
                  </Link>
                )
              }

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab?.(item.id)}
                  className={className}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className={`${!sidebarOpen ? "hidden md:inline" : "inline"} text-sm font-medium`}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Logout */}
          <div className="border-t border-white/10 pt-4">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-foreground/70 hover:text-foreground hover:bg-white/5 transition cursor-pointer">
              <LogOut className="w-5 h-5 shrink-0" />
              <span className={`${!sidebarOpen ? "hidden md:inline" : "inline"} text-sm font-medium`}>
                Logout
              </span>
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
