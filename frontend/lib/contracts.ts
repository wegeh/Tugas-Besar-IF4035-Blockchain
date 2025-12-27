import { BrowserProvider, Contract, JsonRpcProvider, type Provider, type Signer, formatUnits } from "ethers"
import factoryAbi from "@/abi/PTBAEFactory.json"
import speAbi from "@/abi/SPEGRKToken.json"
import ptbaeAbi from "@/abi/PTBAEAllowanceToken.json"
import addresses from "@/abi/addresses.local.json"

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || (addresses as any).rpc || "http://127.0.0.1:8545"
// Prioritize addresses.local.json because deploy.js updates it automatically. 
// Fallback to .env only if json is empty (e.g. in other environments).
const speAddress = (addresses as any).SPEGRKToken?.address || process.env.NEXT_PUBLIC_SPE_ADDRESS || ""
const factoryAddress = (addresses as any).PTBAEFactory?.address || process.env.NEXT_PUBLIC_PTBAE_FACTORY_ADDRESS || ""
const defaultPtbaeAddress = (addresses as any).PTBAEAllowanceToken?.address || process.env.NEXT_PUBLIC_PTBAE_ADDRESS || ""

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
  const targetAddress = address || defaultPtbaeAddress
  if (!targetAddress) throw new Error("PTBAE contract address not set")
  return new Contract(targetAddress, ptbaeAbi.abi, providerOrSigner)
}

// --- Helper Functions ---

export async function getSPEBalance(address: string, tokenId: number = 1): Promise<string> {
  const provider = getRpcProvider()
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
  const provider = getRpcProvider()
  const contract = getPtbaeContract(provider)
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
  const provider = getRpcProvider()
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
