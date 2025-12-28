/**
 * IPFS Utilities for Carbon Ledger ID
 * Uses local IPFS node for file storage
 */

const IPFS_API_URL = process.env.NEXT_PUBLIC_IPFS_API_URL || "http://127.0.0.1:5001";
const IPFS_GATEWAY_URL = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || "http://127.0.0.1:8080";

/**
 * Upload file to local IPFS node
 * @param file File to upload
 * @returns IPFS CID (Content Identifier)
 */
export async function uploadToIPFS(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${IPFS_API_URL}/api/v0/add`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`IPFS upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.Hash; // CID
    } catch (error) {
        console.error("IPFS upload error:", error);
        throw new Error("Gagal upload ke IPFS. Pastikan IPFS node berjalan.");
    }
}

/**
 * Get gateway URL for an IPFS CID
 */
export function getIPFSUrl(cid: string): string {
    return `${IPFS_GATEWAY_URL}/ipfs/${cid}`;
}

/**
 * Check if IPFS node is available
 */
export async function checkIPFSConnection(): Promise<boolean> {
    try {
        const response = await fetch(`${IPFS_API_URL}/api/v0/id`, {
            method: "POST",
        });
        return response.ok;
    } catch {
        return false;
    }
}
