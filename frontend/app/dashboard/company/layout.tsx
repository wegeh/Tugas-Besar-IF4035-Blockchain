"use client"

import { DashboardShell, MenuItem } from "@/components/dashboard-shell"
import { LayoutDashboard, Factory, Send, TreePine, TrendingUp, Wallet } from "lucide-react"

const menuItems: MenuItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/dashboard/company" },
    { id: "compliance", label: "Compliance", icon: Factory, href: "/dashboard/company/compliance" },
    { id: "reporting", label: "Reporting", icon: Send, href: "/dashboard/company/reporting" },
    { id: "project", label: "Green Project", icon: TreePine, href: "/dashboard/company/project" },
    { id: "trading", label: "Trading", icon: TrendingUp, href: "/dashboard/company/trading" },
    { id: "wallet", label: "Wallet", icon: Wallet, href: "/dashboard/company/wallet" },
]

export default function CompanyDashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <DashboardShell menuItems={menuItems}>
            {children}
        </DashboardShell>
    )
}
