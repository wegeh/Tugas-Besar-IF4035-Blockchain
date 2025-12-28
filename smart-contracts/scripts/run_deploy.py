import os
import subprocess
import sys

def main():
    print(">> [python] Running deploy:local with custom env vars")
    
    # Copy current environment
    env = os.environ.copy()
    
    # Set necessary environment variables
    # These match the Makefile defaults
    env["RPC_URL"] = "http://127.0.0.1:8545"
    env["CHAIN_ID"] = "1515"
    
    # Prepare command
    # Use 'pnpm' (shell=True on Windows handles resolution)
    
    cmd = ["pnpm", "run", "deploy:local"]
    
    if sys.platform == "win32":
        # On Windows, use shell=True to resolve pnpm/npm correctly
        use_shell = True
    else:
        use_shell = False

    try:
        subprocess.run(cmd, env=env, check=True, shell=use_shell)
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
