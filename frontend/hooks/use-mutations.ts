"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
    getSigner,
    forwarderAddress,
    getSpeContract,
    getIdrcContract,
    getPtbaeContract,
    getExchangeContract,
    getFactoryContract,
    exchangeAddress,
    idrsAddress
} from "@/lib/contracts"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { parseUnits } from "ethers"

// ============================================================
// SPE / Approval Mutations
// ============================================================

/**
 * Hook to approve SPE contract for all tokens (setApprovalForAll).
 * Used before trading SPE tokens on the exchange.
 */
export function useApproveSPE() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ spender, approved = true }: { spender: string; approved?: boolean }) => {
            const signer = await getSigner()
            const speContract = getSpeContract(signer)
            const speAddress = await speContract.getAddress()

            const data = speContract.interface.encodeFunctionData("setApprovalForAll", [spender, approved])

            toast.info("Requesting SPE approval signature...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, speAddress, data)

            toast.info("Processing SPE approval...")
            const result = await sendMetaTx(request, signature)

            // Wait for confirmation
            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("SPE Approval failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("SPE Approval successful!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["spe"] })
        },
        onError: (error: Error) => {
            toast.error("SPE Approval failed", { description: error.message })
        }
    })
}

/**
 * Hook to approve IDRS spending (ERC20 approve).
 * Used before trading or paying with IDRS.
 */
export function useApproveIDRS() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ spender, amount }: { spender: string; amount?: string }) => {
            const signer = await getSigner()
            const idrsContract = getIdrcContract(signer)

            // Default to max uint256 for unlimited approval
            const approvalAmount = amount
                ? parseUnits(amount, 18)
                : BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")

            const data = idrsContract.interface.encodeFunctionData("approve", [spender, approvalAmount])

            toast.info("Requesting IDRS approval signature...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, idrsAddress, data)

            toast.info("Processing IDRS approval...")
            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("IDRS Approval failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("IDRS Approval successful!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["idrs"] })
        },
        onError: (error: Error) => {
            toast.error("IDRS Approval failed", { description: error.message })
        }
    })
}

// ============================================================
// Compliance Mutations
// ============================================================

export interface SurrenderHybridParams {
    periodYear: number
    tokenAddress: string
    ptbaeAmount: bigint
    speTokenIds: bigint[]
    speAmounts: bigint[]
    idrsAmount: bigint
    carbonPriceSignature: {
        rate: string
        timestamp: number
        signature: string
    }
}

/**
 * Hook for hybrid compliance surrender.
 * Allows companies to fulfill compliance using PTBAE + SPE + IDRS combination.
 */
export function useSurrenderHybrid() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: SurrenderHybridParams) => {
            const signer = await getSigner()
            const ptbaeContract = await getPtbaeContract(signer, params.tokenAddress)

            const data = ptbaeContract.interface.encodeFunctionData("surrenderHybrid", [
                params.ptbaeAmount,
                params.speTokenIds,
                params.speAmounts,
                params.idrsAmount,
                params.carbonPriceSignature.rate,
                params.carbonPriceSignature.timestamp,
                params.carbonPriceSignature.signature
            ])

            toast.info("Signing surrender transaction...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, params.tokenAddress, data)

            toast.info("Processing compliance surrender...")
            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("Surrender transaction failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("Compliance surrender successful!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            // Invalidate all related queries
            queryClient.invalidateQueries({ queryKey: ["compliance"] })
            queryClient.invalidateQueries({ queryKey: ["spe", "tokens"] })
            queryClient.invalidateQueries({ queryKey: ["idrs"] })
        },
        onError: (error: Error) => {
            console.error("Surrender error:", error)
            toast.error("Compliance surrender failed", { description: error.message })
        }
    })
}

/**
 * Hook to burn older period PTBAE tokens for compliance.
 * Used when transferring tokens from older periods to the current compliance year.
 */
export function useBurnForCompliance() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            olderTokenAddress,
            targetTokenAddress,
            amount
        }: {
            olderTokenAddress: string
            targetTokenAddress: string
            amount: bigint
        }) => {
            const signer = await getSigner()
            const olderPtbae = await getPtbaeContract(signer, olderTokenAddress)

            const data = olderPtbae.interface.encodeFunctionData("burnForCompliance", [
                targetTokenAddress,
                amount
            ])

            toast.info("Signing burn transaction...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, olderTokenAddress, data)

            toast.info("Processing burn for compliance...")
            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("Burn transaction failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("Burn for compliance successful!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["compliance"] })
        },
        onError: (error: Error) => {
            toast.error("Burn for compliance failed", { description: error.message })
        }
    })
}

// ============================================================
// Regulator Mutations
// ============================================================

/**
 * Hook to set a period to AUDIT status.
 */
export function useSetAudit() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ tokenAddress }: { tokenAddress: string }) => {
            const signer = await getSigner()
            const ptbaeContract = await getPtbaeContract(signer, tokenAddress)

            const data = ptbaeContract.interface.encodeFunctionData("setAudit", [])

            toast.info("Setting period to AUDIT status...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data)

            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("setAudit failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("Period status updated to AUDIT", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["compliance", "periods"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to set AUDIT status", { description: error.message })
        }
    })
}

/**
 * Hook to finalize a compliance period.
 * Automatically marks non-compliant companies.
 */
export function useFinalize() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ tokenAddress }: { tokenAddress: string }) => {
            const signer = await getSigner()
            const ptbaeContract = await getPtbaeContract(signer, tokenAddress)

            const data = ptbaeContract.interface.encodeFunctionData("finalize", [])

            toast.info("Finalizing compliance period...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data, 5000000)

            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("finalize failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("Period finalized!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["compliance"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to finalize period", { description: error.message })
        }
    })
}

/**
 * Hook for batch allocation of PTBAE tokens to companies.
 */
export function useBatchAllocate() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            tokenAddress,
            recipients,
            amounts
        }: {
            tokenAddress: string
            recipients: string[]
            amounts: bigint[]
        }) => {
            const signer = await getSigner()
            const ptbaeContract = await getPtbaeContract(signer, tokenAddress)

            const data = ptbaeContract.interface.encodeFunctionData("batchAllocate", [
                recipients,
                amounts
            ])

            toast.info("Processing batch allocation...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, tokenAddress, data, 5000000)

            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("Batch allocation failed on-chain")

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("Batch allocation successful!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["compliance"] })
            queryClient.invalidateQueries({ queryKey: ["allocations"] })
        },
        onError: (error: Error) => {
            toast.error("Batch allocation failed", { description: error.message })
        }
    })
}

// ============================================================
// Trading Mutations
// ============================================================

export interface PlaceOrderParams {
    marketType: "SPE" | "PTBAE"
    marketKey: string
    tokenId?: string
    periodYear?: number
    ptbaeAddress?: string
    side: "BID" | "ASK"
    price: string  // Wei string
    amount: string // Wei string
}

/**
 * Hook to place a new order on the exchange.
 */
export function usePlaceOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: PlaceOrderParams) => {
            const signer = await getSigner()
            const address = await signer.getAddress()
            const exchange = getExchangeContract(signer)

            const priceWei = BigInt(params.price)
            const amountWei = BigInt(params.amount)
            const side = params.side === "BID" ? 0 : 1

            let data: string
            if (params.marketType === "SPE") {
                data = exchange.interface.encodeFunctionData("createSPEOrder", [
                    BigInt(params.tokenId!), side, priceWei, amountWei
                ])
            } else {
                data = exchange.interface.encodeFunctionData("createPTBAEOrder", [
                    params.ptbaeAddress, params.periodYear, side, priceWei, amountWei
                ])
            }

            toast.info("Creating order...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, exchangeAddress, data)

            const result = await sendMetaTx(request, signature)

            // Parse order ID from logs
            let onChainId = 0
            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = exchange.interface.parseLog({
                            topics: log.topics as string[],
                            data: log.data
                        })
                        if (parsed?.name === "OrderCreated") {
                            onChainId = Number(parsed.args.orderId)
                            break
                        }
                    } catch { /* ignore unparseable logs */ }
                }
            }

            // Record to database
            await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    walletAddress: address,
                    onChainId,
                    marketType: params.marketType,
                    marketKey: params.marketKey,
                    tokenId: params.tokenId,
                    periodYear: params.periodYear,
                    ptbaeAddress: params.ptbaeAddress,
                    side: params.side,
                    price: params.price,
                    amount: params.amount,
                    txHash: result.txHash
                })
            })

            return { txHash: result.txHash, onChainId }
        },
        onSuccess: (data) => {
            toast.success("Order placed successfully!", { description: `Order ID: ${data.onChainId}` })
            queryClient.invalidateQueries({ queryKey: ["orders"] })
            queryClient.invalidateQueries({ queryKey: ["orderbook"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to place order", { description: error.message })
        }
    })
}

/**
 * Hook to cancel an existing order.
 */
export function useCancelOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ onChainId }: { onChainId: string | number }) => {
            const signer = await getSigner()
            const exchange = getExchangeContract(signer)

            const data = exchange.interface.encodeFunctionData("cancelOrder", [BigInt(onChainId)])

            toast.info("Cancelling order...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, exchangeAddress, data)

            const result = await sendMetaTx(request, signature)

            return { txHash: result.txHash }
        },
        onSuccess: (data) => {
            toast.success("Order cancelled", { description: `Hash: ${data.txHash.slice(0, 10)}...` })
            queryClient.invalidateQueries({ queryKey: ["orders"] })
            queryClient.invalidateQueries({ queryKey: ["orderbook"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to cancel order", { description: error.message })
        }
    })
}

// ============================================================
// SPE Issuance (Regulator)
// ============================================================

export interface IssueSPEParams {
    tokenId: bigint
    recipient: string
    amount: bigint
    meta: {
        projectId: string
        vintageYear: number
        methodology: string
        registryRef: string
    }
    attestationId: string
}

/**
 * Hook to issue SPE tokens to a company (Regulator only).
 */
export function useIssueSPE() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: IssueSPEParams) => {
            const signer = await getSigner()
            const speContract = getSpeContract(signer)
            const speAddress = await speContract.getAddress()

            // Validate regulator role first
            const REGULATOR_ROLE = await speContract.REGULATOR_ROLE()
            const signerAddress = await signer.getAddress()
            const hasRole = await speContract.hasRole(REGULATOR_ROLE, signerAddress)
            if (!hasRole) {
                throw new Error("Signer does not have REGULATOR_ROLE")
            }

            // Static call to validate before sending
            toast.info("Validating transaction...")
            await speContract.issueSPE.staticCall(
                params.tokenId,
                params.recipient,
                params.amount,
                params.meta,
                params.attestationId
            )

            const data = speContract.interface.encodeFunctionData("issueSPE", [
                params.tokenId,
                params.recipient,
                params.amount,
                params.meta,
                params.attestationId
            ])

            toast.info("Issuing SPE tokens...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, speAddress, data)

            const result = await sendMetaTx(request, signature)

            const receipt = await signer.provider?.waitForTransaction(result.txHash)
            if (receipt?.status !== 1) throw new Error("SPE issuance failed on-chain")

            return { txHash: result.txHash, tokenId: params.tokenId }
        },
        onSuccess: async (data) => {
            toast.success("SPE tokens issued!", { description: `Hash: ${data.txHash.slice(0, 10)}...` })

            // Auto-open market for the issued SPE
            try {
                await fetch("/api/markets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        marketType: "SPE",
                        tokenId: data.tokenId.toString(),
                        basePrice: "15000000000000000000000"  // 15,000 IDRC default
                    })
                })
                toast.success("Trading market opened!")
            } catch {
                toast.warning("Token issued, but failed to auto-open market")
            }

            queryClient.invalidateQueries({ queryKey: ["spe"] })
            queryClient.invalidateQueries({ queryKey: ["markets"] })
        },
        onError: (error: Error) => {
            toast.error("SPE issuance failed", { description: error.message })
        }
    })
}

// ============================================================
// API-Only Mutations (No blockchain, just database)
// ============================================================

/**
 * Hook to create a new compliance period in the database.
 * Called after openPeriod() succeeds on-chain.
 */
export function useCreatePeriod() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ year, tokenAddress }: { year: number; tokenAddress: string }) => {
            const res = await fetch("/api/periods", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year, tokenAddress })
            })
            if (!res.ok) throw new Error("Failed to create period in database")
            return res.json()
        },
        onSuccess: () => {
            toast.success("Period registered in database")
            queryClient.invalidateQueries({ queryKey: ["compliance", "periods"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to register period", { description: error.message })
        }
    })
}

/**
 * Hook to update period status in the database.
 * Called after setAudit() or finalize() succeeds on-chain.
 */
export function useUpdatePeriodStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ year, status }: { year: number; status: "ACTIVE" | "AUDIT" | "ENDED" }) => {
            const res = await fetch("/api/periods", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year, status })
            })
            if (!res.ok) throw new Error("Failed to update period status")
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["compliance", "periods"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to update period status", { description: error.message })
        }
    })
}

/**
 * Hook to create a new market in the database.
 */
export function useCreateMarket() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            marketType,
            periodYear,
            tokenId,
            tokenAddress,
            basePrice
        }: {
            marketType: "PTBAE" | "SPE"
            periodYear?: number
            tokenId?: string
            tokenAddress?: string
            basePrice: string
        }) => {
            const res = await fetch("/api/markets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ marketType, periodYear, tokenId, tokenAddress, basePrice })
            })
            if (!res.ok) throw new Error("Failed to create market")
            return res.json()
        },
        onSuccess: () => {
            toast.success("Trading market created!")
            queryClient.invalidateQueries({ queryKey: ["markets"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to create market", { description: error.message })
        }
    })
}

/**
 * Hook to record an allocation in the database.
 * Called after batchAllocate() succeeds on-chain.
 */
export function useRecordAllocation() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            periodYear,
            companyWalletAddresses,
            amount,
            txHash
        }: {
            periodYear: number
            companyWalletAddresses: string[]
            amount: string
            txHash: string
        }) => {
            const res = await fetch("/api/allocations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ periodYear, companyWalletAddresses, amount, txHash })
            })
            if (!res.ok) throw new Error("Failed to record allocation")
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["allocations"] })
            queryClient.invalidateQueries({ queryKey: ["companies"] })
        },
        onError: (error: Error) => {
            toast.error("Failed to record allocation", { description: error.message })
        }
    })
}
