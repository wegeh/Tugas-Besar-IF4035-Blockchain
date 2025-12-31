import os

# Configuration
IMAGE = "ethereum/client-go:v1.13.15"
CONTAINER = "poa-geth"
NETWORK_ID = "1515"
DATA_DIR = "geth-data"
PASSWORD_FILE = "password.txt"

# Read validator and relayer
try:
    with open(".validator", "r") as f:
        validator = f.read().strip() # Keep 0x prefix if present in file, check below
    with open(".relayer", "r") as f:
        relayer = f.read().strip()
except FileNotFoundError:
    print("Error: .validator or .relayer file not found.")
    exit(1)

# Ensure addresses have 0x prefix for Geth flags if missing (usually they have it from previous steps)
if not validator.startswith("0x"): validator = "0x" + validator
if not relayer.startswith("0x"): relayer = "0x" + relayer

print(f"Generating docker-compose.yml with Validator: {validator}")

# Note: We use //data for Windows/Git Bash compatibility in the command section
# But standard /data is fine inside the container path mapping if not passed as arg
# However, to be consistent with previous Makefile fix, let's stick to standard paths inside the yaml
# The command args need //data only when passed from Git Bash CLI, but INSIDE docker-compose.yml
# which is read by Docker Desktop, standard Linux paths usually work fine or standard mounts.
# Wait, if we write the file here, Docker Desktop reads it.
# Docker Desktop on Windows handles standard linux paths in command: section fine.
# The previous issue was MinGW converting CLI args.
# So here we can use standard /data paths safely.

config = f"""services:
  geth:
    image: {IMAGE}
    container_name: {CONTAINER}
    volumes:
      - ./:/data
    ports:
      - "8545:8545"
      - "30303:30303"
    command: >
      --datadir /data/{DATA_DIR}
      --networkid {NETWORK_ID}
      --http --http.addr 0.0.0.0 --http.port 8545
      --http.api eth,net,web3,personal,clique
      --http.corsdomain="*"
      --http.vhosts="*"
      --allow-insecure-unlock
      --unlock "{validator},{relayer}"
      --password /data/{PASSWORD_FILE}
      --miner.etherbase "{validator}"
      --mine
      --syncmode full
      --ipcdisable
      --verbosity 3

  ipfs:
    image: ipfs/kubo:latest
    container_name: carbon-ipfs
    ports:
      - "5001:5001"   # API
      - "8080:8080"   # Gateway
    volumes:
      - ./ipfs_data:/data/ipfs
    environment:
      - IPFS_PROFILE=server
    command: ["daemon", "--offline"]
    restart: unless-stopped
"""

with open("docker-compose.yml", "w") as f:
    f.write(config)

print("docker-compose.yml created.")
