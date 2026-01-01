import { BrowserProvider, Contract, JsonRpcProvider, type Provider, type Signer, formatUnits } from "ethers"
import factoryAbi from "@/abi/PTBAEFactory.json"
import speAbi from "@/abi/SPEGRKToken.json"
import ptbaeAbi from "@/abi/PTBAEAllowanceToken.json"
import oracleAbi from "@/abi/MRVOracle.json"
import submissionAbi from "@/abi/EmissionSubmission.json"
import registryAbi from "@/abi/GreenProjectRegistry.json"
import idrcAbi from "@/abi/IDRStable.json"
import exchangeAbi from "@/abi/CarbonExchange.json"
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
export const idrsAddress = (addresses as any).IDRStable?.address || ""
export const registryAddress = (addresses as any).GreenProjectRegistry?.address || ""
export const exchangeAddress = (addresses as any).CarbonExchange?.address || ""
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

// Export SPE address for external use
export { speAddress }

/**
 * Check if user has approved a specific operator for SPE tokens
 */
export async function checkSPEApproval(owner: string, operator: string): Promise<boolean> {
  const provider = getReadOnlyProvider()
  const contract = getSpeContract(provider)
  try {
    return await contract.isApprovedForAll(owner, operator)
  } catch {
    return false
  }
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

export function getRegistryContract(providerOrSigner: Provider | Signer): Contract {
  if (!registryAddress) throw new Error("GreenProjectRegistry contract address not set")
  return new Contract(registryAddress, registryAbi.abi, providerOrSigner)
}

export function getOracleContract(providerOrSigner: Provider | Signer): Contract {
  if (!oracleAddress) throw new Error("MRVOracle contract address not set")
  return new Contract(oracleAddress, oracleAbi.abi, providerOrSigner)
}

export function getIdrcContract(providerOrSigner: Provider | Signer): Contract {
  if (!idrsAddress) throw new Error("IDRStable contract address not set")
  return new Contract(idrsAddress, idrcAbi.abi, providerOrSigner)
}

export function getExchangeContract(providerOrSigner: Provider | Signer): Contract {
  if (!exchangeAddress) throw new Error("CarbonExchange contract address not set")
  return new Contract(exchangeAddress, exchangeAbi.abi, providerOrSigner)
}

// --- Helper Functions ---

/**
 * Get user's IDRC balance
 */
export async function getIdrcBalance(address: string): Promise<string> {
  const provider = getReadOnlyProvider()
  const contract = getIdrcContract(provider)
  try {
    const balance = await contract.balanceOf(address)
    return balance.toString()
  } catch {
    return "0"
  }
}

/**
 * Check when user can claim IDRC faucet again
 */
export async function getNextFaucetClaim(address: string): Promise<number> {
  const provider = getReadOnlyProvider()
  const contract = getIdrcContract(provider)
  try {
    const nextClaim = await contract.nextFaucetClaim(address)
    return Number(nextClaim)
  } catch {
    return 0
  }
}

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

export async function getSPEBalanceBatch(address: string, tokenIds: number[]): Promise<string[]> {
  const provider = getReadOnlyProvider()
  const contract = getSpeContract(provider)
  try {
    const accounts = Array(tokenIds.length).fill(address)
    const balances = await contract.balanceOfBatch(accounts, tokenIds)
    return balances.map((b: bigint) => b.toString())
  } catch (error) {
    console.error("Error fetching SPE batch balance:", error)
    return tokenIds.map(() => "0")
  }
}

/**
 * Check if SPE token for a project+vintage combination has already been issued
 * @param tokenId - The tokenId (derived from keccak256(projectId, vintage))
 * @returns true if token has been issued (exists on-chain), false otherwise
 */
export async function isTokenIssued(tokenId: bigint): Promise<boolean> {
  const provider = getReadOnlyProvider()
  const contract = getSpeContract(provider)
  try {
    // Check if the token exists by checking if it has any metadata
    const unit = await contract.getUnit(tokenId)
    // If unit exists and has been minted (vintageYear > 0), it's issued
    return unit[0].vintageYear > 0
  } catch {
    // Token doesn't exist
    return false
  }
}

/**
 * Get SPE Unit Metadata for a tokenId
 */
export async function getSPEUnit(tokenId: number | bigint): Promise<UnitMeta | null> {
  const provider = getReadOnlyProvider()
  const contract = getSpeContract(provider)
  try {
    const unit = await contract.getUnit(tokenId)
    // unit is [projectId, vintageYear, methodology, registryRef]
    return {
      projectId: unit[0],
      vintageYear: Number(unit[1]),
      methodology: unit[2],
      registryRef: unit[3]
    }
  } catch (error) {
    console.error(`Error fetching SPE unit for token ${tokenId}:`, error)
    return null
  }
}

/**
 * Get total SPE balance for a user across all token IDs
 * Queries transfer events to find all token IDs sent to the user, then sums balances
 */
export async function getTotalSPEBalance(address: string): Promise<{ total: string, tokens: { tokenId: string, balance: string }[] }> {
  const provider = getReadOnlyProvider()
  const contract = getSpeContract(provider)

  try {
    // Query TransferSingle events where 'to' is the user address
    const filter = contract.filters.TransferSingle(null, null, address)
    const events = await contract.queryFilter(filter, 0, 'latest')

    // Get unique token IDs
    const tokenIdSet = new Set<string>()
    for (const event of events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = (event as any).args
      if (args && args[3]) {
        tokenIdSet.add(args[3].toString()) // args[3] is the tokenId
      }
    }

    // Get balance for each token ID
    const tokens: { tokenId: string, balance: string }[] = []
    let total = BigInt(0)

    for (const tokenIdStr of tokenIdSet) {
      const balance = await contract.balanceOf(address, BigInt(tokenIdStr))
      if (balance > BigInt(0)) {
        tokens.push({ tokenId: tokenIdStr, balance: balance.toString() })
        total += balance
      }
    }

    return { total: total.toString(), tokens }
  } catch (error) {
    console.error("Error fetching total SPE balance:", error)
    return { total: "0", tokens: [] }
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
  COMPLIANT = 2,
  NON_COMPLIANT = 3
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

export interface UnitMeta {
  projectId: string
  vintageYear: number
  methodology: string
  registryRef: string
}

export interface AttestationData {
  docHash: string
  metaHash: string
  valid: boolean
  attestedAt: number
}

// --- SPE-GRK & Oracle Helpers ---

/**
 * Issue SPE-GRK Token (called by Regulator)
 */
export async function issueSPE(
  signer: Signer,
  tokenId: number,
  to: string,
  amount: bigint,
  meta: UnitMeta,
  attestationId: string
) {
  const contract = getSpeContract(signer)
  return contract.issueSPE(tokenId, to, amount, meta, attestationId)
}

/**
 * Create MRV Attestation (called by Oracle/Verifier).
 * Note: Regulator typically has ORACLE_ROLE for simulation/manual verification.
 */
export async function attestMRV(
  signer: Signer,
  attestationId: string,
  mrvDocHash: string,
  metaHash: string
) {
  const contract = getOracleContract(signer)
  return contract.attestMRV(attestationId, mrvDocHash, metaHash)
}

/**
 * Get Attestation details from Oracle
 */
export async function getAttestation(attestationId: string): Promise<AttestationData | null> {
  const provider = getReadOnlyProvider()
  const contract = getOracleContract(provider)
  try {
    const [docHash, metaHash, valid, attestedAt] = await contract.getAttestation(attestationId)
    return {
      docHash,
      metaHash,
      valid,
      attestedAt: Number(attestedAt)
    }
  } catch (error) {
    console.error("Error fetching attestation:", error)
    return null
  }
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

/**
 * Get all submissions for a specific period (Regulator view).
 */
export async function getAllPeriodSubmissions(period: number): Promise<{ user: string, data: SubmissionData }[]> {
  const provider = getReadOnlyProvider()
  const contract = getSubmissionContract(provider)
  const allSubmissions: { user: string, data: SubmissionData }[] = []

  try {
    // 1. Get all submitters for the period
    const submitters: string[] = await contract.getSubmitters(period)

    // 2. Fetch submission data for each submitter
    for (const user of submitters) {
      const [ipfsHash, submittedAt, status, verifiedEmission] = await contract.getSubmission(period, user)
      allSubmissions.push({
        user,
        data: {
          period,
          ipfsHash,
          submittedAt: Number(submittedAt),
          status: Number(status),
          verifiedEmission: verifiedEmission.toString()
        }
      })
    }
  } catch (error) {
    console.error(`Error fetching all submissions for period ${period}:`, error)
  }

  return allSubmissions.sort((a, b) => b.data.submittedAt - a.data.submittedAt)
}

/**
 * Surrender with Offset (PTBAE + SPE-GRK)
 */
export async function surrenderWithOffset(
  signer: Signer,
  periodYear: number,
  speIds: number[],
  speAmounts: bigint[]
) {
  const tokenAddress = await getTokenAddressForPeriod(periodYear)
  if (!tokenAddress) throw new Error("Period token not found")

  const contract = getPtbaeContract(signer, tokenAddress)
  return contract.surrenderWithOffset(speIds, speAmounts)
}

/**
 * Submit Green Project (Phase Independent)
 */
export async function submitProject(signer: Signer, ipfsHash: string) {
  const contract = getRegistryContract(signer)
  return contract.submitProject(ipfsHash)
}

export interface ProjectData {
  ipfsHash: string
  submittedAt: number
  status: number
  verifiedAmount: string
}

/**
 * Get User Projects
 */
export async function getUserProjects(user: string): Promise<ProjectData[]> {
  const provider = getReadOnlyProvider()
  const contract = getRegistryContract(provider)
  try {
    const submissions = await contract.getUserSubmissions(user)
    return submissions.map((s: any) => ({
      ipfsHash: s.ipfsHash,
      submittedAt: Number(s.submittedAt),
      status: Number(s.status),
      verifiedAmount: s.verifiedAmount.toString()
    }))
  } catch (error) {
    console.error("Error fetching user projects:", error)
    return []
  }
}

/**
 * Get All Pending Projects (Regulator View)
 */
export async function getAllGreenProjects(): Promise<{ user: string, data: ProjectData }[]> {
  const provider = getReadOnlyProvider()
  const contract = getRegistryContract(provider)
  const allProjects: { user: string, data: ProjectData }[] = []

  try {
    let index = 0
    while (true) {
      try {
        const user = await contract.projectSubmitters(index)
        const submissions = await contract.getUserSubmissions(user)
        submissions.forEach((s: any) => {
          allProjects.push({
            user,
            data: {
              ipfsHash: s.ipfsHash,
              submittedAt: Number(s.submittedAt),
              status: Number(s.status),
              verifiedAmount: s.verifiedAmount.toString()
            }
          })
        })
        index++
      } catch {
        break // End of list
      }
    }
  } catch (error) {
    console.error("Error fetching all projects", error)
  }
  return allProjects.sort((a, b) => b.data.submittedAt - a.data.submittedAt)
}

// --- IDRS Helpers ---
export function getIdrsContract(providerOrSigner: Provider | Signer) {
  return new Contract(idrsAddress, idrcAbi.abi, providerOrSigner)
}

export async function checkIDRSApproval(owner: string, spender: string, amount: bigint) {
  const provider = getReadOnlyProvider()
  const contract = getIdrsContract(provider)
  try {
    const allowance = await contract.allowance(owner, spender)
    return BigInt(allowance) >= amount
  } catch (error) {
    console.error("Error checking IDRS approval:", error)
    return false
  }
}
