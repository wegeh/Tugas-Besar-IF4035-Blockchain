# CarbonLedgerID Monorepo

This repository hosts three parts of the system:

- `smart-contracts/` — Hardhat workspace for the SPE-GRK (ERC-1155) and PTBAE (ERC-20) contracts.
- `oracle-service/` — Node/Express service that bridges MRV data to the contracts.
- `frontend/` — Next.js app that talks to the contracts (and optionally the oracle).

## Prerequisites
- Node.js 18+ and npm
- Access to your private RPC endpoint and deployer/oracle private keys

## 1) Smart Contracts (Hardhat)
```bash
cd smart-contracts
npm init -y
npm i hardhat @nomicfoundation/hardhat-toolbox dotenv
```

Configure your network in `smart-contracts/hardhat.config.js`:
```js
require("dotenv").config();
const { RPC_URL, DEPLOYER_KEY } = process.env;

module.exports = {
  solidity: "0.8.20",
  networks: {
    private: {
      url: RPC_URL,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
};
```

Add a `.env` in `smart-contracts/`:
```
RPC_URL=https://your-private-rpc
DEPLOYER_KEY=0x...
```

Compile and deploy:
```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network private
```

After deployment:
1. Note the deployed addresses.
2. Copy the ABI JSONs from `smart-contracts/artifacts/contracts/*.json` into `frontend/abi/`.

## 2) Oracle Service
```bash
cd oracle-service
npm init -y
npm i express ethers dotenv cors
```

Fill `oracle-service/.env`:
```
RPC_URL=https://your-private-rpc
ORACLE_PRIVATE_KEY=0x...
SPEGRK_CONTRACT_ADDRESS=0x...
PTBAE_CONTRACT_ADDRESS=0x...   # if needed
```

Run the service:
```bash
node index.js
```

Ensure it logs a successful RPC connection and is ready on your chosen port (default in `index.js` once implemented).

## 3) Frontend (Next.js)
Initialize the app inside `frontend/` (if not yet created):
```bash
cd frontend
npx create-next-app@latest .
npm i wagmi viem ethers
npm i -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
```

Add your copied ABIs to `frontend/abi/` and wire addresses/providers in your wagmi/ethers setup to the same RPC as above.

Run the dev server:
```bash
npm run dev
```

## 4) How Everything Connects
- Frontend ↔ Contracts: uses the RPC URL + deployed addresses + ABIs from `frontend/abi/`.
- Oracle ↔ Contracts: uses `RPC_URL` and `ORACLE_PRIVATE_KEY` to send verified MRV transactions on-chain.
- Frontend ↔ Oracle (optional): frontend can POST to the oracle (e.g., `/api/verify-mrv`) before triggering on-chain calls.

## Quick Checklist
- [ ] Hardhat config updated with your RPC and deployer key.
- [ ] Contracts compiled and deployed; addresses recorded.
- [ ] ABIs copied into `frontend/abi/`.
- [ ] Oracle `.env` filled and service running against the same RPC.
- [ ] Frontend configured to the same RPC and using the deployed addresses.
