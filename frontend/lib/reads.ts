import { JsonRpcProvider } from "ethers"
import { getSpeContract, getPtbaeContract } from "@/lib/contracts"
import addresses from "@/abi/addresses.local.json"

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || (addresses as any).rpc || "http://127.0.0.1:8545"

const formatBig = (v: bigint) => v.toString()

export async function getSpeSnapshot(tokenId: number, account: string) {
  const provider = new JsonRpcProvider(rpcUrl)
  const spe = getSpeContract(provider)
  const [unit, balance] = await Promise.all([spe.getUnit(tokenId), spe.balanceOf(account, tokenId)])

  // getUnit returns meta/status; supply we fetch from contract variable totalSupply(tokenId)
  const supply = await spe.totalSupply(tokenId)
  return {
    balance: formatBig(balance),
    supply: formatBig(supply),
    unit,
  }
}

export async function getCompliance(account: string) {
  const provider = new JsonRpcProvider(rpcUrl)
  const ptbae = getPtbaeContract(provider)
  const [period, balance, surrendered] = await ptbae.getCompliance(account)

  return {
    period: Number(period),
    balance: formatBig(balance),
    surrendered: formatBig(surrendered),
  }
}
