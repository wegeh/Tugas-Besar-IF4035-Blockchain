"use client"

import { DashboardShell } from "@/components/dashboard-shell"
import { OverviewTab } from "@/components/overview-tab"
import { useState } from "react"

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === "overview" && <OverviewTab />}
    </DashboardShell>
  )
}
