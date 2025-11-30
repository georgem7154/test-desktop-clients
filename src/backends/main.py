import os
import sys
import threading
import uvicorn
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# NOTE: The library is named 'uvicorn', but the convention is 'CORSMiddleware' in FastAPI.
# I've corrected the import name to CORSMiddleware.

# --- CONFIGURATION ---
PORT = 8008  # Changed to 8008 to match your React frontend
HOST = "127.0.0.1"

# --- FASTAPI SETUP ---
app = FastAPI(title="Tauri Sidecar API", version="1.0.0")

# Enable CORS so the React frontend can talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (simplest for local Tauri dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- MODELS ---
class OptimizeRequest(BaseModel):
    folder: str  # e.g., "Downloads"


# --- ROUTES ---
@app.post("/optimize")
def run_optimization(payload: OptimizeRequest):
    """
    The main logic triggered by the 'Clean My Downloads' button.
    """
    print(f"[API] Received request to clean: {payload.folder}", flush=True)

    # FIX: Return a Python dictionary. FastAPI automatically converts this
    # into the JSON object {"message": "Optimization complete"}.
    return {"message": f"Optimization requestessd for {payload.folder}"}


# --- PROCESS MANAGEMENT ---

def force_exit():
    """Terminates the script immediately."""
    print("[Sidecar] Shutting down...", flush=True)
    os._exit(0)


def monitor_stdin():
    """
    Listens to the parent process (Rust) for commands.
    CRITICAL FIX: Handles pipe closure (EOF) to prevent infinite loops.
    """
    print("[Sidecar] Listening for parent commands...", flush=True)
    while True:
        try:
            # Read a line from standard input
            raw_line = sys.stdin.readline()

            # 1. EOF CHECK (The Fix):
            # If raw_line is empty string, the pipe was closed by Rust.
            # We must exit, otherwise this loops forever.
            if not raw_line:
                print("[Sidecar] Parent process closed pipe. Exiting.", flush=True)
                force_exit()

            command = raw_line.strip()

            # 2. Handle Commands
            if command == "sidecar shutdown":
                force_exit()
            elif command:
                # Log invalid commands (but ignore empty whitespace lines)
                print(f"[Sidecar] Unknown command: {command}", flush=True)

        except (EOFError, KeyboardInterrupt):
            # Graceful exit on standard termination signals
            force_exit()


def start_server():
    """Bootstraps the Uvicorn server."""
    print(f"[Sidecar] Starting server on {HOST}:{PORT}", flush=True)
    uvicorn.run(app, host=HOST, port=PORT, log_level="error")


if __name__ == "__main__":
    # 1. Start the Input Listener in a background thread
    # Daemon=True means this thread dies if the main thread dies
    listener_thread = threading.Thread(target=monitor_stdin, daemon=True)
    listener_thread.start()

    # 2. Start the API Server (Main Thread Blocks here)
    start_server()