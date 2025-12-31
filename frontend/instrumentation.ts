export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initAuctionScheduler } = await import('@/lib/auction-scheduler')

        // Start the scheduler
        // We don't await it so it runs in background
        initAuctionScheduler()
    }
}
