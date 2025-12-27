"use client"

import { useState } from "react"
import { useConnect, useAccount, useSignMessage, useDisconnect } from "wagmi"
import { signIn } from "next-auth/react"
import { SiweMessage } from "siwe"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Wallet, Loader2, AlertCircle, CheckCircle2, FileSignature } from "lucide-react"
import { injected } from "wagmi/connectors"

type Step = "connect" | "sign" | "loading" | "error" | "success"

export function SiweLoginCard() {
    const [step, setStep] = useState<Step>("connect")
    const [error, setError] = useState<string | null>(null)

    const { connect } = useConnect()
    const { address, isConnected } = useAccount()
    const { signMessageAsync } = useSignMessage()
    const { disconnect } = useDisconnect()

    const handleConnect = async () => {
        try {
            setError(null)
            connect({ connector: injected() })
            setStep("sign")
        } catch (err) {
            setError("Failed to connect wallet")
            console.error(err)
        }
    }

    const handleSignIn = async () => {
        if (!address) {
            setError("No wallet connected")
            return
        }

        try {
            setStep("loading")
            setError(null)

            // Create SIWE message
            const message = new SiweMessage({
                domain: window.location.host,
                address: address,
                statement: "Sign in to CarbonLedgerID. This signature is free and does not send a transaction.",
                uri: window.location.origin,
                version: "1",
                chainId: 1515,
                nonce: Math.random().toString(36).substring(2, 15),
            })

            const messageString = message.prepareMessage()

            // Request signature from wallet
            const signature = await signMessageAsync({ message: messageString })

            // Sign in with NextAuth
            const result = await signIn("siwe", {
                message: messageString,
                signature,
                redirect: false,
            })

            if (result?.error) {
                setError("Login failed. Make sure your wallet is registered by an admin.")
                setStep("sign")
                return
            }

            setStep("success")

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = "/dashboard"
            }, 1000)
        } catch (err) {
            console.error("Sign-in error:", err)
            setError("Signature failed or was rejected")
            setStep("sign")
        }
    }

    const handleDisconnect = () => {
        disconnect()
        setStep("connect")
        setError(null)
    }

    return (
        <Card className="w-full max-w-md glass-lg border-white/10">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold bg-linear-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    🌍 CarbonLedgerID
                </CardTitle>
                <CardDescription className="text-white/70">
                    Sign in with your Ethereum wallet
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Step 1: Connect Wallet */}
                {step === "connect" && (
                    <div className="space-y-4">
                        <p className="text-sm text-white/60 text-center">
                            Connect your MetaMask wallet to continue
                        </p>
                        <Button
                            onClick={handleConnect}
                            className="w-full bg-linear-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
                            size="lg"
                        >
                            <Wallet className="mr-2 h-5 w-5" />
                            Connect MetaMask
                        </Button>
                    </div>
                )}

                {/* Step 2: Sign Message */}
                {step === "sign" && isConnected && (
                    <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                            <p className="text-xs text-white/50 mb-1">Connected Wallet</p>
                            <p className="font-mono text-sm text-emerald-400">
                                {address?.slice(0, 6)}...{address?.slice(-4)}
                            </p>
                        </div>
                        <p className="text-sm text-white/60 text-center">
                            Sign a message to verify your wallet ownership
                        </p>
                        <Button
                            onClick={handleSignIn}
                            className="w-full bg-linear-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
                            size="lg"
                        >
                            <FileSignature className="mr-2 h-5 w-5" />
                            Sign In with Ethereum
                        </Button>
                        <Button
                            onClick={handleDisconnect}
                            variant="ghost"
                            className="w-full text-white/50 hover:text-white/80"
                        >
                            Disconnect & Use Different Wallet
                        </Button>
                    </div>
                )}

                {/* Loading State */}
                {step === "loading" && (
                    <div className="flex flex-col items-center space-y-4 py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                        <p className="text-sm text-white/60">Verifying signature...</p>
                    </div>
                )}

                {/* Success State */}
                {step === "success" && (
                    <div className="flex flex-col items-center space-y-4 py-8">
                        <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                        <p className="text-sm text-white/80">Login successful! Redirecting...</p>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Help Text */}
                <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-white/40 text-center">
                        Don't have access? Contact your administrator to register your wallet address.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
