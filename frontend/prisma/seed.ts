import { PrismaClient, Role } from '../src/generated/prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('Seeding database...')

    // Clear existing users
    // Clear existing data (Order matters due to FK)
    try {
        await prisma.allocation.deleteMany()
        console.log('Deleted existing allocations.')
    } catch (e) {
        console.log('No allocations to delete or error:', e)
    }

    await prisma.user.deleteMany()
    console.log('Deleted existing users.')

    const VALIDATOR = process.env.VALIDATOR
    const RELAYER = process.env.RELAYER

    // Configuration Arrays
    // Only personal wallet is registered as a user for login
    const REGULATORS = [
        {
            walletAddress: '0x2B75471E69E1A38a7bD89800400E8a6A05e4C8Cf',
            companyName: 'Kementerian Lingkungan Hidup',
            email: 'admin@klhk.go.id'
        }
    ]

    const COMPANIES = [
        {
            walletAddress: '0x7CfA165E0f8CBC1d624Ec746117FcC2cDeA9Fc8a',
            companyName: 'PT. Pembangkit Jawa Bali',
            email: 'admin@pjb.com'
        },
        {
            walletAddress: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // Hardhat Account #2
            companyName: 'PT. Semen Indonesia',
            email: 'admin@semenindonesia.com'
        }
    ]

    // 1. Seed Regulators
    console.log('Seeding Regulators...')
    for (const reg of REGULATORS) {
        const user = await prisma.user.upsert({
            where: { walletAddress: reg.walletAddress },
            update: {
                role: Role.REGULATOR,
                companyName: reg.companyName,
                email: reg.email
            },
            create: {
                walletAddress: reg.walletAddress,
                role: Role.REGULATOR,
                companyName: reg.companyName,
                email: reg.email
            },
        })
        console.log(`Upserted Regulator: ${user.companyName} (${user.walletAddress})`)
    }



    // 2. Seed Companies
    console.log('Seeding Companies...')
    for (const comp of COMPANIES) {
        const user = await prisma.user.upsert({
            where: { walletAddress: comp.walletAddress },
            update: {
                role: Role.COMPANY,
                companyName: comp.companyName,
                email: comp.email
            },
            create: {
                walletAddress: comp.walletAddress,
                role: Role.COMPANY,
                companyName: comp.companyName,
                email: comp.email
            },
        })
        console.log(`Upserted Company: ${user.companyName} (${user.walletAddress})`)
    }

    // --- SMART CONTRACT ROLE SETUP ---
    console.log('\n--- Configuring Smart Contract Roles ---')
    try {
        const ethers = require('ethers')
        const fs = require('fs')

        // Load addresses
        const addressesPath = './abi/addresses.local.json'
        if (fs.existsSync(addressesPath)) {
            const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'))
            // Connect to local node
            const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545")
            // Use unlocked account #0 (Deployer)
            const deployer = await provider.getSigner(0)

            console.log('Using Deployer for roles:', await deployer.getAddress())

            const REGULATOR_ROLE = ethers.id("REGULATOR_ROLE")

            // Instantiate Contracts
            let factory, token;

            if (addresses.PTBAEFactory?.address) {
                factory = new ethers.Contract(
                    addresses.PTBAEFactory.address,
                    ["function grantRole(bytes32 role, address account) public", "function hasRole(bytes32 role, address account) public view returns (bool)"],
                    deployer
                )
            }

            if (addresses.PTBAEAllowanceToken?.address) {
                token = new ethers.Contract(
                    addresses.PTBAEAllowanceToken.address,
                    ["function grantRole(bytes32 role, address account) public", "function hasRole(bytes32 role, address account) public view returns (bool)"],
                    deployer
                )
            }

            // Loop through ALL Regulators
            for (const reg of REGULATORS) {
                const regulatorAddr = reg.walletAddress

                // Grant on Factory
                if (factory) {
                    const hasRole = await factory.hasRole(REGULATOR_ROLE, regulatorAddr)
                    if (!hasRole) {
                        console.log(`[Factory] Granting REGULATOR_ROLE to ${regulatorAddr}...`)
                        const tx = await factory.grantRole(REGULATOR_ROLE, regulatorAddr)
                        await tx.wait()
                        console.log('Granted!')
                    } else {
                        console.log(`[Factory] ${regulatorAddr} already has REGULATOR_ROLE.`)
                    }
                }

                // Grant on Token
                if (token) {
                    const hasRole = await token.hasRole(REGULATOR_ROLE, regulatorAddr)
                    if (!hasRole) {
                        console.log(`[Token] Granting REGULATOR_ROLE to ${regulatorAddr}...`)
                        const tx = await token.grantRole(REGULATOR_ROLE, regulatorAddr)
                        await tx.wait()
                        console.log('Granted!')
                    } else {
                        console.log(`[Token] ${regulatorAddr} already has REGULATOR_ROLE.`)
                    }
                }
            }

        } else {
            console.warn('addresses.local.json not found. Skipping smart contract role setup.')
        }

    } catch (contractError) {
        console.error('Failed to configure smart contracts:', contractError)
        // Don't fail the whole seed, just warn
    }

}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
