"use client"

import { DashboardShell, MenuItem } from "@/components/dashboard-shell"
import { LayoutDashboard, FileText, ShieldCheck, Leaf } from "lucide-react"

const menuItems: MenuItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/dashboard/regulator" },
    { id: "allocations", label: "Allocations", icon: FileText, href: "/dashboard/regulator/allocations" },
    { id: "issuance", label: "Issuance", icon: Leaf, href: "/dashboard/regulator/issuance" },
    { id: "verification", label: "MRV Verification", icon: ShieldCheck, href: "/dashboard/regulator/verification" },
]

export default function RegulatorDashboardLayout({
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
