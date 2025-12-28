import time
import urllib.request
import json
import sys
import os

def wait_for_rpc(url="http://127.0.0.1:8545", timeout=60):
    start = time.time()
    payload = json.dumps({"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}).encode('utf-8')
    headers = {"Content-Type": "application/json"}
    
    print(f"Waiting for RPC at {url}...")
    
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, data=payload, headers=headers)
            with urllib.request.urlopen(req) as response:
                if response.status == 200:
                    print("RPC is ready!")
                    return True
        except Exception:
            time.sleep(1)
            
    print("Timeout waiting for RPC.")
    return False

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8545"
    if not wait_for_rpc(url):
        sys.exit(1)
