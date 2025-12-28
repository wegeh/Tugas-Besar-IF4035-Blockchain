import { BrowserProvider, Contract, JsonRpcProvider, type Provider, type Signer, formatUnits } from "ethers"
import factoryAbi from "@/abi/PTBAEFactory.json"
import speAbi from "@/abi/SPEGRKToken.json"
import ptbaeAbi from "@/abi/PTBAEAllowanceToken.json"
import oracleAbi from "@/abi/MRVOracle.json"
import submissionAbi from "@/abi/EmissionSubmission.json"
import addresses from "@/abi/addresses.local.json"

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || (addresses as any).rpc || "http://127.0.0.1:8545"
// Prioritize addresses.local.json because deploy.js updates it automatically. 
// Fallback to .env only if json is empty (e.g. in other environments).
const speAddress = (addresses as any).SPEGRKToken?.address || process.env.NEXT_PUBLIC_SPE_ADDRESS || ""
const factoryAddress = (addresses as any).PTBAEFactory?.address || process.env.NEXT_PUBLIC_PTBAE_FACTORY_ADDRESS || ""
const defaultPtbaeAddress = (addresses as any).PTBAEAllowanceToken?.address || process.env.NEXT_PUBLIC_PTBAE_ADDRESS || ""
export const forwarderAddress = (addresses as any).Forwarder?.address || ""
export const oracleAddress = (addresses as any).MRVOracle?.address || ""
export const submissionAddress = (addresses as any).EmissionSubmission?.address || ""
export const DEBUG_FACTORY_ADDRESS = factoryAddress

// Local PoA network configuration
const HARDHAT_CHAIN_ID = "0x5EB" // 1515
const HARDHAT_NETWORK = {
  chainId: HARDHAT_CHAIN_ID,
  chainName: "Local PoA",
  rpcUrls: ["http://127.0.0.1:8545"],
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
}

async function ensureHardhatNetwork(): Promise<void> {
  if (typeof window === "undefined" || !(window as any).ethereum) return

  const ethereum = (window as any).ethereum

  try {
    // Try to switch to Hardhat network
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_CHAIN_ID }],
    })
  } catch (switchError: any) {
    // Error code 4902 means the chain hasn't been added to MetaMask
    if (switchError.code === 4902) {
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [HARDHAT_NETWORK],
        })
      } catch (addError) {
        console.error("Failed to add Hardhat network:", addError)
        throw new Error("Please add Local PoA network to MetaMask manually")
      }
    } else {
      console.error("Failed to switch network:", switchError)
      throw new Error("Please switch to Local PoA network in MetaMask")
    }
  }
}

export function getRpcProvider(): Provider {
  if (typeof window !== "undefined" && (window as any).ethereum) {
    return new BrowserProvider((window as any).ethereum)
  }
  return new JsonRpcProvider(rpcUrl)
}

/**
 * Get a read-only provider that ALWAYS connects to the local RPC.
 * Use this for balance queries and other read operations to avoid MetaMask network issues.
 */
export function getReadOnlyProvider(): Provider {
  return new JsonRpcProvider(rpcUrl)
}

export async function getSigner(): Promise<Signer> {
  const provider = getRpcProvider()
  if (provider instanceof BrowserProvider) {
    // First, ensure we're on the correct network
    await ensureHardhatNetwork()
    // Then request accounts and get signer
    await (provider as BrowserProvider).send("eth_requestAccounts", [])
    return provider.getSigner()
  }
  throw new Error("No browser wallet found. Install MetaMask or set NEXT_PUBLIC_RPC_URL with a local signer.")
}

export function getFactoryContract(providerOrSigner: Provider | Signer): Contract {
  if (!factoryAddress) throw new Error("Factory contract address not set")
  return new Contract(factoryAddress, factoryAbi.abi, providerOrSigner)
}

export function getSpeContract(providerOrSigner: Provider | Signer): Contract {
  if (!speAddress) throw new Error("SPE contract address not set")
  return new Contract(speAddress, speAbi.abi, providerOrSigner)
}

export function getPtbaeContract(providerOrSigner: Provider | Signer, address?: string): Contract {
  const addr = address || defaultPtbaeAddress
  if (!addr) throw new Error("PTBAE contract address not set")
  return new Contract(addr, ptbaeAbi.abi, providerOrSigner)
}

export function getSubmissionContract(providerOrSigner: Provider | Signer): Contract {
  if (!submissionAddress) throw new Error("EmissionSubmission contract address not set")
  return new Contract(submissionAddress, submissionAbi.abi, providerOrSigner)
}

export function getOracleContract(providerOrSigner: Provider | Signer): Contract {
  if (!oracleAddress) throw new Error("MRVOracle contract address not set")
  return new Contract(oracleAddress, oracleAbi.abi, providerOrSigner)
}

// --- Helper Functions ---

export async function getSPEBalance(address: string, tokenId: number = 1): Promise<string> {
  const provider = getReadOnlyProvider()
  const contract = getSpeContract(provider)
  try {
    const balance = await contract.balanceOf(address, tokenId)
    return balance.toString()
  } catch (error) {
    console.error("Error fetching SPE balance:", error)
    return "0"
  }
}

export async function getPTBAEBalance(address: string): Promise<string> {
  const provider = getReadOnlyProvider()
  const contract = getPtbaeContract(provider)
  const addr = await contract.getAddress()
  console.log(`[Debug] Fetching PTBAE Balance for ${address} on Contract ${addr}`)
  try {
    const balance = await contract.balanceOf(address)
    return balance.toString() // Returns raw amount (wei), easier to format in UI
  } catch (error) {
    const addr = await contract.getAddress().catch(() => "unknown")
    console.error(`Error fetching PTBAE balance for ${address} at ${addr}:`, error)
    return "0"
  }
}


export async function getCurrentPeriod(): Promise<number> {
  const provider = getReadOnlyProvider()
  const contract = getPtbaeContract(provider)

  // Check if contract exists to avoid BAD_DATA error
  try {
    const code = await provider.getCode(await contract.getAddress())
    if (code === "0x") {
      console.warn("PTBAE Contract not found at address. Check deployment.")
      return 0
    }
  } catch (e) {
    console.warn("Could not check contract code:", e)
  }

  // Checking PTBAEAllowanceToken.sol: "uint32 public immutable period;"
  try {
    const period = await contract.period()
    return Number(period)
  } catch (error) {
    console.warn("Error fetching period (likely ABI mismatch or network issue):", error)
    return 0
  }
}

/**
 * Get the PTBAEAllowanceToken address for a specific period from the Factory.
 * Data source: Smart Contract (PTBAEFactory.tokenByPeriod)
 */
export async function getTokenAddressForPeriod(period: number): Promise<string | null> {
  const provider = getReadOnlyProvider()
  const factory = getFactoryContract(provider)
  try {
    const tokenAddress = await factory.tokenByPeriod(period)
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      return null
    }
    return tokenAddress
  } catch (error) {
    console.error(`Error fetching token address for period ${period}:`, error)
    return null
  }
}

/**
 * Get PTBAE balance for a specific user and period.
 * Data source: Smart Contract (PTBAEAllowanceToken.balanceOf)
 */
export async function getPTBAEBalanceForPeriod(address: string, period: number): Promise<string> {
  const tokenAddress = await getTokenAddressForPeriod(period)
  if (!tokenAddress) {
    return "0"
  }
  const provider = getReadOnlyProvider()
  const contract = getPtbaeContract(provider, tokenAddress)
  try {
    const balance = await contract.balanceOf(address)
    return balance.toString()
  } catch (error) {
    console.error(`Error fetching PTBAE balance for period ${period}:`, error)
    return "0"
  }
}

// --- Compliance Lifecycle Functions ---

export enum PeriodStatus {
  ACTIVE = 0,
  AUDIT = 1,
  ENDED = 2
}

export enum ComplianceStatus {
  NO_DATA = 0,
  PENDING = 1,
  COMPLIANT = 2
}

export interface ComplianceInfo {
  period: number
  balance: string
  surrendered: string
  verifiedEmission: string
  debt: string
  status: ComplianceStatus
}

/**
 * Get the status of a specific compliance period.
 * Data source: Smart Contract (PTBAEAllowanceToken.status)
 */
export async function getPeriodStatus(period: number): Promise<PeriodStatus> {
  const tokenAddress = await getTokenAddressForPeriod(period)
  if (!tokenAddress) {
    throw new Error(`No contract found for period ${period}`)
  }
  const provider = getReadOnlyProvider()
  const contract = getPtbaeContract(provider, tokenAddress)
  try {
    const status = await contract.status()
    return Number(status) as PeriodStatus
  } catch (error) {
    console.error(`Error fetching status for period ${period}:`, error)
    return PeriodStatus.ENDED // Safe fallback
  }
}
/**
 * Get compliance info for a user in a specific period.
 * Data source: Smart Contract (PTBAEAllowanceToken.getCompliance)
 */
export async function getComplianceInfo(period: number, userAddress: string): Promise<ComplianceInfo | null> {
  const tokenAddress = await getTokenAddressForPeriod(period)
  if (!tokenAddress) {
    return null
  }
  const provider = getReadOnlyProvider()
  const contract = getPtbaeContract(provider, tokenAddress)
  try {
    const [p, balance, surrenderedAmt, verifiedEmission, debt, cStatus] = await contract.getCompliance(userAddress)
    return {
      period: Number(p),
      balance: balance.toString(),
      surrendered: surrenderedAmt.toString(),
      verifiedEmission: verifiedEmission.toString(),
      debt: debt.toString(),
      status: Number(cStatus) as ComplianceStatus
    }
  } catch (error) {
    console.error(`Error fetching compliance info for period ${period}:`, error)
    return null
  }
}

/**
 * Get verified emission for a user in a specific period from Oracle.
 */
export async function getVerifiedEmission(period: number, userAddress: string): Promise<string> {
  const provider = getReadOnlyProvider()
  const oracle = getOracleContract(provider)
  try {
    const emission = await oracle.getVerifiedEmission(period, userAddress)
    return emission.toString()
  } catch (error) {
    console.error(`Error fetching verified emission:`, error)
    return "0"
  }
}

export interface SubmissionData {
  period: number
  ipfsHash: string
  submittedAt: number
  status: number // 0=PENDING, 1=VERIFIED, 2=REJECTED
  verifiedEmission: string
}

/**
 * Get all submissions for a user across multiple periods.
 * Data source: Smart Contract (EmissionSubmission.getSubmission)
 */
export async function getUserSubmissions(userAddress: string, periods: number[]): Promise<SubmissionData[]> {
  const provider = getReadOnlyProvider()
  const contract = getSubmissionContract(provider)
  const submissions: SubmissionData[] = []

  for (const period of periods) {
    try {
      const [ipfsHash, submittedAt, status, verifiedEmission] = await contract.getSubmission(period, userAddress)

      // Only include if user has submitted for this period (ipfsHash will be empty string if not submitted)
      if (ipfsHash && ipfsHash.length > 0) {
        submissions.push({
          period,
          ipfsHash,
          submittedAt: Number(submittedAt),
          status: Number(status),
          verifiedEmission: verifiedEmission.toString()
        })
      }
    } catch (error) {
      console.error(`Error fetching submission for period ${period}:`, error)
    }
  }

  return submissions.sort((a, b) => b.period - a.period) // Sort by period descending
}
