"use client"

import { useMemo, useState } from "react"
import { Contract } from "ethers"
import { getRpcProvider, getSigner, getSpeContract, getPtbaeContract } from "@/lib/contracts"
import { toast } from "sonner"

type TxState = "idle" | "pending"

export function useContractActions() {
  const [state, setState] = useState<TxState>("idle")

  const provider = useMemo(() => getRpcProvider(), [])

  const wrapTx = async (fn: () => Promise<any>, success: string) => {
    try {
      setState("pending")
      const tx = await fn()
      toast.loading("Waiting for confirmation...", { id: tx.hash })
      await tx.wait()
      toast.success(success, { id: tx.hash })
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || "Transaction failed")
    } finally {
      setState("idle")
    }
  }

  const transferSPE = async (tokenId: number, to: string, amount: bigint) => {
    const signer = await getSigner()
    const contract: Contract = getSpeContract(signer)
    const from = await signer.getAddress()
    await wrapTx(
      async () => contract.safeTransferFrom(from, to, tokenId, amount, "0x"),
      "SPE transferred"
    )
  }

  const retireSPE = async (tokenId: number, amount: bigint) => {
    const signer = await getSigner()
    const contract: Contract = getSpeContract(signer)
    await wrapTx(() => contract.retireSPE(tokenId, amount), "SPE retired")
  }

  const transferPTBAE = async (to: string, amount: bigint) => {
    const signer = await getSigner()
    const contract: Contract = getPtbaeContract(signer)
    await wrapTx(() => contract.transfer(to, amount), "PTBAE transferred")
  }

  const surrenderPTBAE = async (amount: bigint) => {
    const signer = await getSigner()
    const contract: Contract = getPtbaeContract(signer)
    await wrapTx(() => contract.surrender(amount), "PTBAE surrendered")
  }

  const getUnit = async (tokenId: number) => {
    const contract: Contract = getSpeContract(provider)
    return contract.getUnit(tokenId)
  }

  const getCompliance = async (account: string) => {
    const contract: Contract = getPtbaeContract(provider)
    return contract.getCompliance(account)
  }

  return {
    state,
    transferSPE,
    retireSPE,
    transferPTBAE,
    surrenderPTBAE,
    getUnit,
    getCompliance,
  }
}
