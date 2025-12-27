# CarbonLedgerID Monorepo

This repository hosts three parts of the system:

- `smart-contracts/` — Hardhat workspace for the SPE-GRK (ERC-1155) and PTBAE (ERC-20) contracts.
- `oracle-service/` — Node/Express service that bridges MRV data to the contracts.
- `frontend/` — Next.js app that talks to the contracts (and optionally the oracle).

## Prerequisites
- Node.js 18+ and npm
- Access to your private RPC endpoint and deployer/oracle private keys

## 0) Running the Private Blockchain (Clique PoA)

This project uses a **private Ethereum-compatible blockchain** with
**Proof of Authority (Clique)** consensus.  
The blockchain configuration is provided in the `chain/` folder, while
runtime state and credentials are generated locally.

### Prerequisites
- Docker & Docker Compose

### First-Time Setup (One-Time Only)

From the repository root:

    cd chain

Create a password file for the validator account:

    echo password > password.txt

Create the validator account (address will be stored locally):

    docker run --rm -v ${PWD}:/data ethereum/client-go:v1.13.15 account new --datadir /data/geth-data --password /data/password.txt

Initialize the blockchain state:

    docker run --rm -v ${PWD}:/data ethereum/client-go:v1.13.15 init --datadir /data/geth-data /data/genesis.json

> These steps are required only once.  
> The generated files are stored locally and are not committed to the repository.

### Start the Blockchain

    docker compose up -d

The node will expose an RPC endpoint at:

    http://localhost:8545

### Verify the Chain (PowerShell)

Check chain ID:

    Invoke-RestMethod -Uri http://localhost:8545 -Method POST -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

Expected result:

    0x5eb

Check block production (should increase on repeated calls):

    Invoke-RestMethod -Uri http://localhost:8545 -Method POST -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

### MetaMask Configuration

Add a custom network in MetaMask:
- Network Name: Local Clique PoA
- RPC URL: http://localhost:8545
- Chain ID: 1515
- Currency Symbol: ETH

Transfer ETH from the validator account to other accounts if needed
for contract deployment and frontend testing.

### Notes
- This blockchain is **private and permissioned**
- Consensus uses **Clique Proof of Authority**
- Intended for **academic and local development use only**


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

## Local dev quickstart (Hardhat + MetaMask)
1) Start a local node (Hardhat default):
```bash
cd smart-contracts
npx hardhat node --port 8545 --hostname 127.0.0.1
```
2) Deploy contracts to localhost and copy ABIs/addresses:
```bash
npx hardhat run scripts/deploy.js --network localhost
```
This writes `smart-contracts/deployments/localhost.json` and refreshes `frontend/abi/` (including `addresses.local.json`).

3) Frontend env (`frontend/.env.local`):
```
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_SPE_ADDRESS=<from deploy log or addresses.local.json>
NEXT_PUBLIC_PTBAE_ADDRESS=<from deploy log or addresses.local.json>
AUTH_SECRET=<32+ chars>
DATABASE_URL=<your postgres>
```
Restart `npm run dev` after changes.

4) MetaMask setup for Hardhat:
- Network: name = Hardhat Local, RPC URL = http://127.0.0.1:8545, Chain ID = 31337, Symbol = ETH.
- Import a Hardhat test account (from `npx hardhat node` output):
  - Example Account #0 PK: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
  - Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Switch MetaMask to this network/account, then approve the site connection when prompted.

5) Using the dashboard:
- The dashboard reads balances via RPC; it will use your connected wallet if present, else fallback to the deployer address.
- The quick actions (transfer/retire/surrender) send real transactions; ensure MetaMask is on the Hardhat network and the account holds the tokens (default deploy mints to Account #0 tokenId=1, allocates PTBAE to Account #0).
- If you use a different account, transfer tokens from Account #0 to that account first (via the card actions) or change the deploy script to mint/allocate to your desired address and redeploy.



```bash
docker run --rm -v "$PWD":/data ethereum/client-go:stable \
  account new --datadir /data/geth-data --password /data/password.txt
```
