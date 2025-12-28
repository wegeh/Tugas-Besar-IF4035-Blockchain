import os
import subprocess
import sys

# Configuration
IMAGE = "ethereum/client-go:v1.13.15"
DATA_DIR = "geth-data"
PASSWORD_FILE = "password.txt"
PASSWORD_VALUE = "password"
VALIDATOR_FILE = ".validator"
RELAYER_FILE = ".relayer"
GENESIS_FILE = "genesis.json"

def run_docker_account_new():
    # docker run --rm -v "$(CURDIR)":/data -w //data $(IMAGE) account new --datadir ./$(DATA_DIR) --password ./$(PASSWORD)
    # Note: On Windows, $(CURDIR) might be messy. Using os.getcwd()
    cwd = os.getcwd()
    # Normalize path for Docker mount?
    # Windows paths need to be handled carefuly.
    # On Git Bash: /c/Users/...
    # On Cmd: c:\Users...
    # Docker Desktop for Windows handles c:\Users... usually.
    
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{cwd}:/data",
        "-w", "/data",
        IMAGE,
        "account", "new",
        "--datadir", f"./{DATA_DIR}",
        "--password", f"./{PASSWORD_FILE}"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        # Parse output: "Public address of the key:   0x..."
        for line in result.stdout.splitlines():
            if "Public address of the key" in line:
                # Split by colon and strip
                parts = line.split(":")
                if len(parts) > 1:
                    address = parts[1].strip()
                    return address
        
        # If not found in stdout, check stderr (Geth sometimes prints to stderr)
        for line in result.stderr.splitlines():
             if "Public address of the key" in line:
                parts = line.split(":")
                if len(parts) > 1:
                    address = parts[1].strip()
                    return address
                    
        print("Could not find address in output")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        return None
    except subprocess.CalledProcessError as e:
        print("Error running docker:", e)
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        return None

def init_accounts():
    print(">> Python Init: Creating password file...")
    with open(PASSWORD_FILE, "w") as f:
        f.write(PASSWORD_VALUE)
    
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    print(">> Python Init: Creating Validator account...")
    validator = run_docker_account_new()
    if validator:
        print(f"   Validator = {validator}")
        with open(VALIDATOR_FILE, "w") as f:
            f.write(validator)
    else:
        sys.exit(1)

    print(">> Python Init: Creating Relayer account...")
    relayer = run_docker_account_new()
    if relayer:
        print(f"   Relayer   = {relayer}")
        with open(RELAYER_FILE, "w") as f:
            f.write(relayer)
    else:
        sys.exit(1)

def init_chain_db():
    print(">> Python Init: Initializing Geth DB...")
    cwd = os.getcwd()
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{cwd}:/data",
        "-w", "/data",
        IMAGE,
        "--datadir", f"./{DATA_DIR}",
        "init", f"./{GENESIS_FILE}"
    ]
    subprocess.run(cmd, check=True)

def show_info():
    if os.path.exists(VALIDATOR_FILE):
        with open(VALIDATOR_FILE, "r") as f:
            print(f"   Validator: {f.read().strip()}")
    else:
        print("   Validator: N/A")
        
    if os.path.exists(RELAYER_FILE):
        with open(RELAYER_FILE, "r") as f:
            print(f"   Relayer  : {f.read().strip()}")
    else:
        print("   Relayer  : N/A")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "accounts":
            init_accounts()
        elif cmd == "init-chain":
            init_chain_db()
        elif cmd == "show-info":
            show_info()
    else:
        print("Usage: python init_chain.py [accounts|init-chain|show-info]")
