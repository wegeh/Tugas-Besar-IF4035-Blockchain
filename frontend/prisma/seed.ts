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
    await prisma.user.deleteMany()
    console.log('Deleted existing users.')

    // 1. Regulator (Admin)
    // Wallet Address Anda (User)
    const regulator = await prisma.user.upsert({
        where: { walletAddress: '0x2B75471E69E1A38a7bD89800400E8a6A05e4C8Cf' },
        update: {},
        create: {
            walletAddress: '0x2B75471E69E1A38a7bD89800400E8a6A05e4C8Cf',
            role: Role.REGULATOR,
            companyName: 'Kementerian Lingkungan Hidup',
            email: 'admin@klhk.go.id'
        },
    })
    console.log({ regulator })

    // 2. Company A (User provided address for testing)
    const companyA = await prisma.user.upsert({
        where: { walletAddress: '0x7CfA165E0f8CBC1d624Ec746117FcC2cDeA9Fc8a' },
        update: {},
        create: {
            walletAddress: '0x7CfA165E0f8CBC1d624Ec746117FcC2cDeA9Fc8a',
            role: Role.COMPANY,
            companyName: 'PT. Pembangkit Jawa Bali',
            email: 'admin@pjb.com'
        },
    })
    console.log({ companyA })

    // 3. Company B
    const companyB = await prisma.user.upsert({
        where: { walletAddress: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc' }, // Hardhat Account #2
        update: {},
        create: {
            walletAddress: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // Hardhat Account #2
            role: Role.COMPANY,
            companyName: 'PT. Semen Indonesia',
            email: 'admin@semenindonesia.com'
        },
    })
    console.log({ companyB })
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
