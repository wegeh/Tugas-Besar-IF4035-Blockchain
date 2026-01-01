# CarbonLedgerID Monorepo

This repository hosts three parts of the system:

- `smart-contracts/` — Hardhat workspace for the SPE-GRK (ERC-1155) and PTBAE (ERC-20) contracts.
- `oracle-service/` — Node/Express service that bridges MRV data to the contracts.
- `frontend/` — Next.js app that talks to the contracts (and optionally the oracle).

## Prerequisites
- Node.js 18+ and npm
- Access to your private RPC endpoint and deployer/oracle private keys

## Quick Start (Hybrid Mode)

This project uses a hybrid setup:
- **Docker**: Local Blockchain (Geth PoA), IPFS Node, and PostgreSQL Database.
- **Local (Concurrent)**: frontend (Next.js) and oracle-service (Node.js).

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ & pnpm (`npm install -g pnpm`)
- Python 3 (for scripts)

### 1. Configure Seeding Accounts
Before running, you **MUST** update the seeding configuration with your MetaMask wallet address to mock the initial state correctly.

Edit: `config/users.json`
```json
{
    "regulators": [
        {
            "walletAddress": "0xYOUR_REGULATOR_WALLET",
            "companyName": "Kementerian Lingkungan Hidup",
            "email": "admin@klhk.go.id"
        }
    ],
    "companies": [
        {
            "walletAddress": "0xYOUR_COMPANY_A_WALLET",
            "companyName": "PT. Pembangkit Jawa Bali",
            "email": "admin@pjb.com"
        },
        {
            "walletAddress": "0xYOUR_COMPANY_B_WALLET",
            "companyName": "PT. Semen Indonesia",
            "email": "admin@semenindonesia.com"
        }
    ]
}
```
> Replace with your actual development wallet addresses to ensure you can interact with the app.

### 2. Run the Project
To start everything (Infrastructure + Apps):
```bash
make run
```
This command will automatically:
1.  **Bootstrap**: Start Docker containers (Chain, IPFS, DB), deploy contracts, and seed the database.
2.  **Build**: Clean build the frontend application.
3.  **Launch**: Run `oracle-service` and `frontend` (Production Mode) concurrently in your terminal.

> **Note**: The frontend will be available at [http://localhost:3000](http://localhost:3000). The RPC endpoint is [http://localhost:8545](http://localhost:8545).

### 3. Stop & Reset
To stop and **wipe all data** (including blockchain state and DB):
```bash
make reset
```
To just stop services without wiping data:
```bash
make stop
```

---
### Manual commands (if needed)
- `make chain-up`: Start only the blockchain & IPFS.
- `make fe-db-up`: Start only Postgres.
- `make sc-deploy`: Redeploy smart contracts.
- `make fe-seed`: Re-run seeding script.
