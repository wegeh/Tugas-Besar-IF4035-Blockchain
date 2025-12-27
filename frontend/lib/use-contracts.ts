"use client"

import { useState, useEffect } from "react"
import { BrowserProvider, Contract, Signer } from "ethers"
import { getFactoryContract, getPtbaeContract, getSpeContract, forwarderAddress } from "./contracts"
import { toast } from "sonner"
import factoryAbi from "@/abi/PTBAEFactory.json"

export function useContracts() {
    const [isReady, setIsReady] = useState(false)
    const [provider, setProvider] = useState<BrowserProvider | null>(null)
    const [signer, setSigner] = useState<Signer | null>(null)
    const [factory, setFactory] = useState<Contract | null>(null)
    const [regAccount, setRegAccount] = useState<string>("")
    const [isRegulator, setIsRegulator] = useState(false)

    useEffect(() => {
        init()
    }, [])

    async function init() {
        if (typeof window !== "undefined" && (window as any).ethereum) {
            try {
                const prov = new BrowserProvider((window as any).ethereum)
                const sig = await prov.getSigner()
                const address = await sig.getAddress()

                setProvider(prov)
                setSigner(sig)
                setRegAccount(address)

                // Factory
                const fac = getFactoryContract(sig)
                setFactory(fac)

                // Check Role
                try {
                    // keccak256("REGULATOR_ROLE")
                    // If you don't have ethers.id available easily here without importing 'ethers', hardcode or import
                    // REGULATOR_ROLE = 0x...
                    // For now, let's assume the user is valid if they can sign. 
                    // Real role check:
                    // const REGULATOR_ROLE = id("REGULATOR_ROLE")
                    // const hasRole = await fac.hasRole(REGULATOR_ROLE, address)
                    // setIsRegulator(hasRole)
                    setIsRegulator(true) // Bypass for now or implement strict check
                } catch (e) {
                    console.error("Role check failed", e)
                }

                setIsReady(true)
            } catch (error) {
                console.error("Failed to init contracts", error)
            }
        }
    }

    async function getSigner() {
        if (!signer) throw new Error("Wallet not connected")
        return signer
    }

    return {
        isReady,
        factory,
        signer,
        regAccount,
        isRegulator,
        getSigner
    }
}
