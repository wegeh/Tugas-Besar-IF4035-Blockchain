import os
import shutil
import stat

files_to_remove = ["genesis.json", "password.txt", ".validator", ".relayer"]
dirs_to_remove = ["geth-data", "ipfs_data"]

def remove_readonly(func, path, exc_info):
    """
    Error handler for shutil.rmtree.
    If the error is due to an access error (read only file)
    it attempts to add write permission and then retries.
    If the error is for another reason it re-raises the error.
    """
    # Clear the readonly bit and reattempt the removal
    os.chmod(path, stat.S_IWRITE)
    func(path)

def cleanup():
    print(">> Python Cleanup: Removing old data...")
    for f in files_to_remove:
        if os.path.exists(f):
            try:
                os.remove(f)
                print(f"Removed {f}")
            except Exception as e:
                print(f"Error removing {f}: {e}")

    for d in dirs_to_remove:
        if os.path.exists(d):
            try:
                shutil.rmtree(d, onerror=remove_readonly)
                print(f"Removed directory {d}")
            except Exception as e:
                print(f"Error removing {d}: {e}")

if __name__ == "__main__":
    cleanup()
