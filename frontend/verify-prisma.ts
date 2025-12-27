
import { prisma } from "./lib/prisma"

async function main() {
    console.log("Checking Prisma Client...")
    // @ts-ignore
    if (prisma.compliancePeriod) {
        console.log("SUCCESS: prisma.compliancePeriod exists.")
        // @ts-ignore
        const count = await prisma.compliancePeriod.count()
        console.log("Count:", count)
    } else {
        console.error("FAILURE: prisma.compliancePeriod is undefined.")
        console.log("Available keys:", Object.keys(prisma))
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect()
    })
