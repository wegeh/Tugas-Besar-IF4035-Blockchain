import { BrowserProvider, Contract, JsonRpcProvider, type Provider, type Signer } from "ethers"
import speAbi from "@/abi/SPEGRKToken.json"
import ptbaeAbi from "@/abi/PTBAEAllowanceToken.json"
import addresses from "@/abi/addresses.local.json"

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || (addresses as any).rpc || "http://127.0.0.1:8545"
const speAddress = process.env.NEXT_PUBLIC_SPE_ADDRESS || (addresses as any).SPEGRKToken?.address || ""
const ptbaeAddress =
  process.env.NEXT_PUBLIC_PTBAE_ADDRESS || (addresses as any).PTBAEAllowanceToken?.address || ""

export function getRpcProvider(): Provider {
  if (typeof window !== "undefined" && (window as any).ethereum) {
    return new BrowserProvider((window as any).ethereum)
  }
  return new JsonRpcProvider(rpcUrl)
}

export async function getSigner(): Promise<Signer> {
  const provider = getRpcProvider()
  if (provider instanceof BrowserProvider) {
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
