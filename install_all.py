import os
import subprocess
import sys

def run(cmd, cwd):
    print(f"\n==> Running: {cmd} (in {cwd})")
    result = subprocess.run(cmd, cwd=cwd, shell=True)
    if result.returncode != 0:
        print(f"Error running: {cmd}")
        sys.exit(result.returncode)

def main():
    root = os.path.dirname(os.path.abspath(__file__))

    # Backend
    backend_dir = os.path.join(root, "backend")
    if os.path.isdir(backend_dir):
        run("npm install", backend_dir)
    else:
        print("No backend directory found.")

    # Frontend
    frontend_dir = os.path.join(root, "frontend")
    if os.path.isdir(frontend_dir):
        run("npm install", frontend_dir)
    else:
        print("No frontend directory found.")

    print("\nAll dependencies installed!")

if __name__ == "__main__":
    main() 