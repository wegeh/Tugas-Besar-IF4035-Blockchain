import json
import os

# Read files
try:
    with open(".validator", "r") as f:
        validator = f.read().strip().lower().replace("0x", "")
    with open(".relayer", "r") as f:
        relayer = f.read().strip().lower().replace("0x", "")
except FileNotFoundError:
    print("Error: .validator or .relayer file not found.")
    exit(1)

# Config
CHAIN_ID = 1515
PERIOD = 5
EPOCH = 30000
PREFUND_ETH = 1000000
GENESIS_FILE = "genesis.json"

vanity = "00" * 32
signature = "00" * 65
extraData = "0x" + vanity + validator + signature

genesis = {
    "config": {
        "chainId": CHAIN_ID,
        "homesteadBlock": 0,
        "eip150Block": 0,
        "eip155Block": 0,
        "eip158Block": 0,
        "byzantiumBlock": 0,
        "constantinopleBlock": 0,
        "petersburgBlock": 0,
        "istanbulBlock": 0,
        "berlinBlock": 0,
        "londonBlock": 0,
        "clique": {"period": PERIOD, "epoch": EPOCH}
    },
    "difficulty": "1",
    "gasLimit": "0x1C9C380",
    "extradata": extraData,
    "alloc": {
        "0x" + validator: {"balance": str(PREFUND_ETH * 10**18)},
        "0x" + relayer: {"balance": str(PREFUND_ETH * 10**18)}
    }
}

with open(GENESIS_FILE, "w") as f:
    json.dump(genesis, f, indent=2)

print(f"Genesis created at {GENESIS_FILE}")
