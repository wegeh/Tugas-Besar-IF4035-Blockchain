import { http, createConfig } from "wagmi"
import { defineChain } from "viem"

// Define our local PoA chain
export const localPoA = defineChain({
    id: 1515,
    name: "CarbonLedger PoA",
    nativeCurrency: {
        decimals: 18,
        name: "Ether",
        symbol: "ETH",
    },
    rpcUrls: {
        default: {
            http: ["http://127.0.0.1:8545"],
        },
    },
})

export const wagmiConfig = createConfig({
    chains: [localPoA],
    transports: {
        [localPoA.id]: http(),
    },
})
