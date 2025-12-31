"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Send, Info, Leaf } from "lucide-react"
import { toast } from "sonner"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { getSigner, forwarderAddress, getRegistryContract, getUserProjects, submitProject, type ProjectData } from "@/lib/contracts"
import { uploadToIPFS } from "@/lib/ipfs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default function ProjectPage() {
    const { address } = useAccount()
    const [loading, setLoading] = useState(false)
    const [submissions, setSubmissions] = useState<ProjectData[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    // Form State
    const [projectId, setProjectId] = useState("")
    const [vintage, setVintage] = useState("")
    const [methodology, setMethodology] = useState("")
    const [registryRef, setRegistryRef] = useState("")
    const [reportFile, setReportFile] = useState<File | null>(null)

    const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || "http://127.0.0.1:8080/ipfs"

    useEffect(() => {
        async function loadSubmissionHistory() {
            if (address) {
                setLoadingHistory(true)
                try {
                    const userProjects = await getUserProjects(address)
                    setSubmissions(userProjects)
                } catch (error) {
                    console.error("Error loading project history:", error)
                } finally {
                    setLoadingHistory(false)
                }
            }
        }
        loadSubmissionHistory()
    }, [address])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setReportFile(e.target.files[0])
        }
    }

    const handleSubmitProject = async () => {
        if (!reportFile || !projectId || !vintage) {
            toast.error("Please fill all required fields.")
            return
        }

        // Validate Vintage Year
        const currentYear = new Date().getFullYear()
        const vintageNum = Number(vintage)

        if (isNaN(vintageNum) || vintageNum < 2000) {
            toast.error("Invalid Vintage Year", { description: "Year must be > 2000" })
            return
        }

        if (vintageNum >= currentYear) {
            toast.error("Invalid Vintage Year", {
                description: `Vintage Year (${vintageNum}) must be before current year (${currentYear}).`
            })
            return
        }

        setLoading(true)
        try {
            // 2. Upload metadata and file to IPFS
            toast.info("Uploading", { description: "Uploading document to IPFS..." })

            // For simplicity, we'll upload the file and include metadata in the hash
            // In production, you'd want to upload both file and metadata.json
            const ipfsHash = await uploadToIPFS(reportFile)
            console.log("IPFS Hash:", ipfsHash)

            // 3. Submit to Blockchain (GreenProjectRegistry)
            const signer = await getSigner()
            const contract = getRegistryContract(signer)

            // IPFS String Format: "SPE|projectId|vintage|methodology|registryRef|ipfsHash"
            // Note: We use "SPE" prefix just for consistency, though Registry is dedicated.
            const metadataString = `SPE|${projectId}|${vintage}|${methodology}|${registryRef}|${ipfsHash}`

            const data = contract.interface.encodeFunctionData("submitProject", [
                metadataString
            ])
            const to = await contract.getAddress()

            toast.info("Signing Request", { description: "Submitting project to registry..." })
            console.log("Creating MetaTx...")
            const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)
            console.log("MetaTx Signed:", signature)

            toast.info("Processing", { description: "Sending submission..." })
            console.log("Sending to Relayer...")
            const result = await sendMetaTx(request, signature)
            console.log("Relayer Result:", result)

            toast.success("Success!", { description: `Project submitted. Hash: ${ipfsHash.slice(0, 10)}...` })

            // Reset form
            setReportFile(null)
            setProjectId("")
            setVintage("")
            setMethodology("")
            setRegistryRef("")

            // Refresh history
            if (address) {
                const userProjects = await getUserProjects(address)
                setSubmissions(userProjects)
            }
        } catch (error: any) {
            console.error("Project Submission Error:", error)
            toast.error("Failed: " + error.message)
        } finally {
            setLoading(false)
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
                <h1 className="text-3xl font-bold">Green Project Reporting</h1>
                <p className="text-muted-foreground">
                    Submit carbon offset projects for SPE-GRK credit issuance.
                </p>
            </div>



            {/* Upload Form */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Leaf className="h-5 w-5 text-green-600" />
                        <CardTitle>Submit Green Project</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Project ID *</Label>
                            <Input
                                placeholder="e.g., SOLAR-001"
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Vintage Year *</Label>
                            <Input
                                type="number"
                                placeholder="e.g., 2024"
                                value={vintage}
                                onChange={(e) => setVintage(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Methodology</Label>
                            <Input
                                placeholder="e.g., ACM0002"
                                value={methodology}
                                onChange={(e) => setMethodology(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Registry Reference</Label>
                            <Input
                                placeholder="e.g., VCS-12345"
                                value={registryRef}
                                onChange={(e) => setRegistryRef(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Project Document *</Label>
                            <Input
                                type="file"
                                accept=".pdf,.xlsx,.csv,.doc,.docx"
                                className="cursor-pointer"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleSubmitProject}
                        disabled={loading || !reportFile || !projectId || !vintage}
                        className="w-full bg-green-600 hover:bg-green-700"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Send className="mr-2 h-4 w-4" />
                        Submit Project
                    </Button>
                </CardContent>
            </Card>

            {/* Submission History */}
            <Card>
                <CardHeader>
                    <CardTitle>All Project Submissions</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span>Loading projects...</span>
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <Leaf className="h-12 w-12 mb-2 opacity-50" />
                            <p>No project submissions yet.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Project ID</TableHead>
                                    <TableHead>Vintage</TableHead>
                                    <TableHead>Submitted At</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Verified Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {submissions.map((sub, idx) => {
                                    // Parse metadata from ipfsHash
                                    const parts = sub.ipfsHash.split("|")
                                    const projectIdFromHash = parts[1] || "N/A"
                                    const vintageFromHash = parts[2] || "N/A"

                                    return (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium">{projectIdFromHash}</TableCell>
                                            <TableCell>{vintageFromHash}</TableCell>
                                            <TableCell>{new Date(sub.submittedAt * 1000).toLocaleString()}</TableCell>
                                            <TableCell>{getStatusBadge(sub.status)}</TableCell>
                                            <TableCell>
                                                {sub.status === 1 && sub.verifiedAmount !== "0"
                                                    ? `${(BigInt(sub.verifiedAmount) / BigInt(10 ** 18)).toString()} Ton`
                                                    : "-"}
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
