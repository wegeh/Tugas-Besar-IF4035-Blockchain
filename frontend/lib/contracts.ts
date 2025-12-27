import { BrowserProvider, Contract, JsonRpcProvider, type Provider, type Signer } from "ethers"
import speAbi from "@/abi/SPEGRKToken.json"
import ptbaeAbi from "@/abi/PTBAEAllowanceToken.json"
import addresses from "@/abi/addresses.local.json"

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || (addresses as any).rpc || "http://127.0.0.1:8545"
const speAddress = process.env.NEXT_PUBLIC_SPE_ADDRESS || (addresses as any).SPEGRKToken?.address || ""
const ptbaeAddress =
  process.env.NEXT_PUBLIC_PTBAE_ADDRESS || (addresses as any).PTBAEAllowanceToken?.address || ""

// Hardhat Local network configuration
const HARDHAT_CHAIN_ID = "0x7A69" // 31337
const HARDHAT_NETWORK = {
  chainId: HARDHAT_CHAIN_ID,
  chainName: "Hardhat Local",
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
        throw new Error("Please add Hardhat Local network to MetaMask manually")
      }
    } else {
      console.error("Failed to switch network:", switchError)
      throw new Error("Please switch to Hardhat Local network in MetaMask")
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

export function getSpeContract(providerOrSigner: Provider | Signer): Contract {
  if (!speAddress) throw new Error("SPE contract address not set")
  return new Contract(speAddress, speAbi.abi, providerOrSigner)
}

export function getPtbaeContract(providerOrSigner: Provider | Signer): Contract {
  if (!ptbaeAddress) throw new Error("PTBAE contract address not set")
  return new Contract(ptbaeAddress, ptbaeAbi.abi, providerOrSigner)
}
