"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Send, Info, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { createMetaTx, sendMetaTx } from "@/lib/meta-tx"
import { getSigner, forwarderAddress, getSubmissionContract, getUserSubmissions, type SubmissionData } from "@/lib/contracts"
import { uploadToIPFS } from "@/lib/ipfs"
import { getCompliancePeriods } from "@/app/actions/period-actions"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface PeriodAllocation {
    year: number
    status: string
}

export default function ReportingPage() {
    const { address } = useAccount()
    const [loading, setLoading] = useState(false)
    const [reportPeriod, setReportPeriod] = useState("")
    const [reportFile, setReportFile] = useState<File | null>(null)
    const [periods, setPeriods] = useState<PeriodAllocation[]>([])
    const [submissions, setSubmissions] = useState<SubmissionData[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || "http://127.0.0.1:8080/ipfs"

    useEffect(() => {
        async function loadPeriods() {
            const p = await getCompliancePeriods()
            setPeriods(p)
        }
        loadPeriods()
    }, [])

    useEffect(() => {
        async function loadSubmissionHistory() {
            if (address && periods.length > 0) {
                setLoadingHistory(true)
                try {
                    const periodYears = periods.map(p => p.year)
                    const userSubmissions = await getUserSubmissions(address, periodYears)
                    setSubmissions(userSubmissions)
                } catch (error) {
                    console.error("Error loading submission history:", error)
                } finally {
                    setLoadingHistory(false)
                }
            }
        }
        loadSubmissionHistory()
    }, [address, periods])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setReportFile(e.target.files[0])
        }
    }

    const handleSubmitReport = async () => {
        if (!reportPeriod || !reportFile) {
            toast.error("Please select a period and upload a file.")
            return
        }

        setLoading(true)
        try {
            // 1. Upload to IPFS
            toast.info("Uploading", { description: "Uploading document to IPFS..." })
            const ipfsHash = await uploadToIPFS(reportFile)
            console.log("IPFS Hash:", ipfsHash)

            // 2. Submit to Blockchain (MetaTx)
            const signer = await getSigner()
            const contract = getSubmissionContract(signer)

            const data = contract.interface.encodeFunctionData("submitEmission", [
                Number(reportPeriod),
                ipfsHash
            ])
            const to = await contract.getAddress()

            toast.info("Signing Request", { description: "Submitting report hash to blockchain..." })
            const { request, signature } = await createMetaTx(signer, forwarderAddress, to, data)

            toast.info("Processing", { description: "Sending submission..." })
            const result = await sendMetaTx(request, signature)

            toast.success("Success!", { description: `Report submitted. hash: ${ipfsHash.slice(0, 10)}...` })
            setReportFile(null)
            setReportPeriod("")

            // Refresh submission history
            if (address && periods.length > 0) {
                const periodYears = periods.map(p => p.year)
                const userSubmissions = await getUserSubmissions(address, periodYears)
                setSubmissions(userSubmissions)
            }
        } catch (error: any) {
            console.error("Submission Error:", error)
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
                <h1 className="text-3xl font-bold">MRV Reporting</h1>
                <p className="text-muted-foreground">
                    Submit emission reports for verification by Oracle
                </p>
            </div>



            {/* Upload Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Submit Emission Report</CardTitle>
                    <CardDescription>
                        Upload dokumen laporan emisi Anda. File akan disimpan di IPFS dan hash-nya dicatat di blockchain.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Select Compliance Period</Label>
                        <select
                            id="reportPeriod"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            value={reportPeriod}
                            onChange={(e) => setReportPeriod(e.target.value)}
                        >
                            <option value="">-- Select Period --</option>
                            {periods.filter(p => p.status === 'AUDIT').map(p => (
                                <option key={p.year} value={p.year}>
                                    Period {p.year} (AUDIT Phase)
                                </option>
                            ))}
                            {periods.filter(p => p.status === 'AUDIT').length === 0 && (
                                <option disabled>No periods in AUDIT phase</option>
                            )}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="emissionFile">Emission Report Document</Label>
                        <Input
                            id="emissionFile"
                            type="file"
                            accept=".pdf,.xlsx,.csv,.doc,.docx"
                            className="cursor-pointer"
                            onChange={handleFileChange}
                        />
                        <p className="text-xs text-muted-foreground">
                            Accepted formats: PDF, Excel, CSV, Word
                        </p>
                    </div>

                    <Button
                        onClick={handleSubmitReport}
                        disabled={loading || !reportPeriod || !reportFile || periods.filter(p => p.status === 'AUDIT').length === 0}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Send className="mr-2 h-4 w-4" />
                        Submit Report
                    </Button>

                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Note</AlertTitle>
                        <AlertDescription>
                            Setelah submit, Oracle akan memverifikasi dokumen dan menetapkan tagihan emisi Anda.
                            Proses ini mungkin membutuhkan waktu beberapa saat.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            {/* Submission History */}
            <Card>
                <CardHeader>
                    <CardTitle>Submission History</CardTitle>
                    <CardDescription>Your past emission report submissions</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            <span>Loading submission history...</span>
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <p>No submissions yet.</p>
                            <p className="text-sm">Submit your first emission report above.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Submitted At</TableHead>
                                    <TableHead>IPFS Document</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Verified Emission</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {submissions.map((sub) => (
                                    <TableRow key={`${sub.period}-${sub.submittedAt}`}>
                                        <TableCell className="font-medium">{sub.period}</TableCell>
                                        <TableCell>{new Date(sub.submittedAt * 1000).toLocaleString()}</TableCell>
                                        <TableCell>
                                            <a
                                                href={`${ipfsGateway}/${sub.ipfsHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center text-blue-600 hover:underline"
                                            >
                                                <span className="font-mono text-xs">{sub.ipfsHash.slice(0, 12)}...</span>
                                                <ExternalLink className="ml-1 h-3 w-3" />
                                            </a>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(sub.status)}</TableCell>
                                        <TableCell>
                                            {sub.status === 1 && sub.verifiedEmission !== "0"
                                                ? `${(BigInt(sub.verifiedEmission) / BigInt(10 ** 18)).toString()} Ton`
                                                : "-"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
