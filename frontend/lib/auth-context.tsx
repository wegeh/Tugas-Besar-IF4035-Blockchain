"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type AuthUser = {
  id: string
  email: string
  role: string
  companyName?: string | null
  walletAddress?: string | null
}

type AuthContextType = {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => Promise<void>
  loading: boolean
  refreshing: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" })
    if (!res.ok) return null
    const data = await res.json()
    return data.user ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    ;(async () => {
      const u = await fetchCurrentUser()
      setUser(u)
      setLoading(false)
    })()
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    const u = await fetchCurrentUser()
    setUser(u)
    setRefreshing(false)
  }

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch {
      // ignore
    }
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      setUser,
      logout,
      loading,
      refreshing,
      refresh,
    }),
    [user, loading, refreshing]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
