"use client"

import { DashboardShell, MenuItem } from "@/components/dashboard-shell"
import { LayoutDashboard, Calendar, Factory, Leaf, Send, TreePine } from "lucide-react"

const menuItems: MenuItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/dashboard/company" },
    { id: "allocations", label: "Allocations", icon: Calendar, href: "/dashboard/company/allocations" },
    { id: "compliance", label: "Compliance", icon: Factory, href: "/dashboard/company/compliance" },
    { id: "offset", label: "Offsetting", icon: Leaf, href: "/dashboard/company/offset" },
    { id: "reporting", label: "Reporting", icon: Send, href: "/dashboard/company/reporting" },
    { id: "project", label: "Green Project", icon: TreePine, href: "/dashboard/company/project" },
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
