"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Leaf } from "lucide-react"
import { toast } from "sonner"
import { getSigner, getAllGreenProjects, type ProjectData, type UnitMeta, getSpeContract } from "@/lib/contracts"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { solidityPackedKeccak256, getAddress } from "ethers"

export default function IssuancePage() {
    const { address } = useAccount()
    const [loadingRows, setLoadingRows] = useState<Record<number, boolean>>({})
    const [submissions, setSubmissions] = useState<{ user: string, data: ProjectData }[]>([])
    const [loadingData, setLoadingData] = useState(false)

    const loadSubmissions = async () => {
        setLoadingData(true)
        try {
            const projects = await getAllGreenProjects()
            setSubmissions(projects)
        } catch (error) {
            console.error("Error loading submissions:", error)
            toast.error("Failed to load project submissions")
        } finally {
            setLoadingData(false)
        }
    }

    useEffect(() => {
        loadSubmissions()
    }, [])

    // Direct Issue with full debugging
    const handleDirectIssue = async (user: string, data: ProjectData, idx: number) => {
        setLoadingRows(prev => ({ ...prev, [idx]: true }))
        try {
            const signer = await getSigner()
            const signerAddress = await signer.getAddress()
            console.log("=== DIRECT ISSUE DEBUG ===")
            console.log("Signer Address:", signerAddress)

            // Parse metadata
            const parts = data.ipfsHash.split("|");
            const projectId = parts[1] || "";
            const vintageNum = parseInt(parts[2]) || 0;
            const methodology = parts[3] || "";
            const registryRef = parts[4] || "";

            const currentYear = new Date().getFullYear();
            if (vintageNum >= currentYear) {
                throw new Error(`Vintage Year (${vintageNum}) must be < Current Year (${currentYear})`)
            }

            const meta: UnitMeta = { projectId, vintageYear: vintageNum, methodology, registryRef };
            console.log("Meta:", meta)

            const attestationId = solidityPackedKeccak256(
                ["string", "address", "string"],
                ["spe", getAddress(user), data.ipfsHash]
            );
            console.log("AttestationID:", attestationId)

            const uniqueProjectKey = solidityPackedKeccak256(
                ["string", "uint16"],
                [meta.projectId, meta.vintageYear]
            );
            const tokenId = BigInt(uniqueProjectKey);
            const amount = BigInt(data.verifiedAmount);

            console.log("TokenID:", tokenId.toString())
            console.log("To (Company):", user)
            console.log("Amount:", amount.toString())

            const contract = getSpeContract(signer);
            const contractAddress = await contract.getAddress()
            console.log("SPE Contract Address:", contractAddress)

            // Step 1: Check Role
            console.log("--- Checking Role ---")
            const REGULATOR_ROLE = await contract.REGULATOR_ROLE()
            const hasRole = await contract.hasRole(REGULATOR_ROLE, signerAddress)
            console.log("Signer has REGULATOR_ROLE?", hasRole)
            if (!hasRole) {
                throw new Error(`Signer ${signerAddress} does NOT have REGULATOR_ROLE!`)
            }

            // Step 2: Check transaction data encoding
            console.log("--- Checking TX Data Encoding ---")
            const txReq = await contract.issueSPE.populateTransaction(tokenId, user, amount, meta, attestationId);
            console.log("Populated TX To:", txReq.to)
            console.log("Populated TX Data:", txReq.data?.substring(0, 66) + "...") // First 66 chars (selector + first param)
            console.log("TX Data Length:", txReq.data?.length)

            if (!txReq.data || txReq.data === "0x" || txReq.data === "") {
                throw new Error("TX DATA IS EMPTY! ABI or encoding issue.")
            }

            // Step 3: staticCall to get error before sending
            console.log("--- Running staticCall to check for revert ---")
            toast.info("Checking transaction validity...")
            try {
                await contract.issueSPE.staticCall(tokenId, user, amount, meta, attestationId);
                console.log("staticCall PASSED - transaction should succeed")
            } catch (staticError: any) {
                console.error("staticCall FAILED:", staticError)
                console.error("Error Name:", staticError.errorName)
                console.error("Error Args:", staticError.errorArgs)
                console.error("Short Message:", staticError.shortMessage)
                console.error("Reason:", staticError.reason)

                // Try to decode the error
                if (staticError.data) {
                    console.error("Error Data:", staticError.data)
                }

                throw new Error(`staticCall failed: ${staticError.shortMessage || staticError.message}`)
            }

            // Step 4: Send actual transaction
            console.log("--- Sending Transaction ---")
            toast.info("Sending transaction...")
            const tx = await contract.issueSPE(tokenId, user, amount, meta, attestationId);
            console.log("TX Hash:", tx.hash)

            toast.info("Waiting for confirmation...")
            const receipt = await tx.wait();
            console.log("TX Confirmed in Block:", receipt.blockNumber)

            toast.success("Tokens Issued!", { description: `Block: ${receipt.blockNumber}` });
            loadSubmissions();

        } catch (error: any) {
            console.error("=== DIRECT ISSUE ERROR ===")
            console.error("Full Error:", error)
            console.error("Error Name:", error.errorName)
            console.error("Error Args:", error.errorArgs)
            console.error("Error Code:", error.code)
            console.error("Error Data:", error.data)
            console.error("Error Reason:", error.reason)
            toast.error("Direct Issuance Failed", { description: error.shortMessage || error.message || "Unknown error" });
        } finally {
            setLoadingRows(prev => ({ ...prev, [idx]: false }))
        }
    }

    const getStatusBadge = (status: number) => {
        switch (status) {
            case 0: return <Badge className="bg-yellow-600">PENDING</Badge>
            case 1: return <Badge className="bg-green-600">VERIFIED</Badge>
            case 2: return <Badge variant="destructive">REJECTED</Badge>
            default: return <Badge variant="secondary">UNKNOWN</Badge>
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">SPE-GRK Issuance</h1>
                <p className="text-muted-foreground">
                    Issue Carbon Credit tokens (SPE-GRK) for verified green projects.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Verified Green Projects</CardTitle>
                            <CardDescription>All pending projects ready for issuance.</CardDescription>
                        </div>
                        <Button variant="outline" onClick={loadSubmissions} disabled={loadingData}>
                            {loadingData ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingData ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span>Loading projects...</span>
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <Leaf className="h-12 w-12 mb-2 opacity-50" />
                            <p>No green projects found pending issuance.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Project ID</TableHead>
                                    <TableHead>Vintage</TableHead>
                                    <TableHead>Verified Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {submissions.map((item, idx) => {
                                    const { user, data } = item
                                    const parts = data.ipfsHash.split("|")
                                    const projectId = parts[1] || "N/A"
                                    const vintage = parts[2] || "N/A"
                                    const amount = BigInt(data.verifiedAmount)
                                    const isLoading = loadingRows[idx] || false

                                    return (
                                        <TableRow key={idx}>
                                            <TableCell className="font-mono text-xs">{user}</TableCell>
                                            <TableCell>{projectId}</TableCell>
                                            <TableCell>{vintage}</TableCell>
                                            <TableCell>
                                                {amount > 0 ? `${amount / BigInt(10 ** 18)} Ton` : "-"}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(data.status)}</TableCell>
                                            <TableCell>
                                                {data.status === 1 && amount > 0 ? (
                                                    <Button
                                                        size="sm"
                                                        className="bg-green-600 hover:bg-green-700"
                                                        onClick={() => handleDirectIssue(user, data, idx)}
                                                        disabled={isLoading}
                                                    >
                                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Issue Token"}
                                                    </Button>
                                                ) : (
                                                    <Button size="sm" variant="ghost" disabled>
                                                        {data.status === 0 ? "Pending Verification" : "Cannot Issue"}
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
