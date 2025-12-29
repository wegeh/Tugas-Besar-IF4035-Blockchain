import subprocess
import time
import sys

def run_command_with_retry(command, retries=10, delay=2):
    for i in range(retries):
        try:
            # We use shell=False for list of args
            print(f"Running (Attempt {i+1}/{retries}): {' '.join(command)}")
            subprocess.run(command, check=True, shell=False)
            return True
        except subprocess.CalledProcessError:
            print(f"Command failed. Retrying in {delay}s...")
            time.sleep(delay)
    
    print(f"Error: Command failed after {retries} attempts.")
    return False

def configure_ipfs():
    print(">> Configuring IPFS CORS settings...")
    
    container_name = "carbon-ipfs"
    
    # Config 1: Allow Origin
    cmd_origin = [
        "docker", "exec", container_name,
        "ipfs", "config", "--json", 
        "API.HTTPHeaders.Access-Control-Allow-Origin", 
        '["*"]' 
    ]
    
    # Config 2: Allow Methods
    cmd_methods = [
        "docker", "exec", container_name,
        "ipfs", "config", "--json", 
        "API.HTTPHeaders.Access-Control-Allow-Methods", 
        '["PUT", "POST", "GET"]'
    ]

    # Config 3: Allow Credentials
    cmd_creds = [
        "docker", "exec", container_name,
        "ipfs", "config", "--json", 
        "API.HTTPHeaders.Access-Control-Allow-Credentials", 
        '["true"]'
    ]

    if run_command_with_retry(cmd_origin) and run_command_with_retry(cmd_methods) and run_command_with_retry(cmd_creds):
        print(">> Configuration applied. Restarting container...")
        subprocess.run(["docker", "restart", container_name], check=False) # valid check=False as restart might fail if container just died, but usually fine.
        print("[SUCCESS] IPFS Configured Successfully!")
    else:
        print("[ERROR] Failed to configure IPFS.")
        sys.exit(1)

if __name__ == "__main__":
    configure_ipfs()
