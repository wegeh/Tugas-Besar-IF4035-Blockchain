import os
import subprocess
import sys

def read_file(path):
    try:
        with open(path, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        print(f"Error: File not found: {path}")
        sys.exit(1)

def main():
    print(">> [python] Running seed with custom env vars")
    
    # Paths
    base_dir = os.getcwd()
    chain_dir = os.path.join(base_dir, "chain")
    frontend_dir = os.path.join(base_dir, "frontend")
    
    validator_file = os.path.join(chain_dir, ".validator")
    relayer_file = os.path.join(chain_dir, ".relayer")
    
    # Read addresses
    validator = read_file(validator_file)
    relayer = read_file(relayer_file)
    
    # Environment
    env = os.environ.copy()
    env["VALIDATOR"] = validator
    env["RELAYER"] = relayer
    env["RPC_URL"] = "http://127.0.0.1:8545" # Default if not set
    
    # Command
    # Use pnpm exec prisma db seed
    cmd = ["pnpm", "exec", "prisma", "db", "seed"]
    
    if sys.platform == "win32":
        use_shell = True
    else:
        use_shell = False

    print(f"   Validator: {validator}")
    print(f"   Relayer  : {relayer}")
    
    try:
        subprocess.run(cmd, cwd=frontend_dir, env=env, check=True, shell=use_shell)
    except subprocess.CalledProcessError as e:
        print(f"Error executing seed: {e}")
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
