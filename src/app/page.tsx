"use client"
import { useEffect, useState } from "react";
// FIX: Using the singular import path to potentially resolve esbuild issues.
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// Define the expected JSON response type for safe TypeScript usage
interface OptimizationResponse {
  message: string;
}

export default function Home() {
  const [logs, setLogs] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  // State to track if the Python server is confirmed to be running.
  const [isServerReady, setIsServerReady] = useState(false);

  // 1. LISTEN FOR LOGS AND SERVER READY SIGNAL
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    // Define an async function to encapsulate the sidecar logic
    const setupListeners = async () => {
      // Start the sidecar (always the first step)
      await invoke("start_sidecar").catch(console.error);

      // Listen for print statements from the Python sidecar
      unlisten = await listen('sidecar-stdout', (event) => {
        const message = String(event.payload);

        // Check for the unique READY_SIGNAL from the Python sidecar
        if (message.includes("READY_SIGNAL")) {
          setIsServerReady(true);
          setLogs(prev => prev + `\n[UI] Backend ready for requests.`);
        }

        // Always log the output
        setLogs(prev => prev + `\n${message}`);
      });
    };

    // Initialize the setup
    void setupListeners(); // Use 'void' to explicitly mark promise as intentionally not awaited/handled here

    // Cleanup listener on unmount
    // This return function must be synchronous, so we check for the defined unlisten function.
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // 2. TRIGGER OPTIMIZATION
  const handleOptimize = async () => {
    if (!isServerReady) {
      setLogs(prev => prev + "\n[UI] Error: Backend is not yet ready. Please wait.");
      return;
    }

    setIsOptimizing(true);
    setLogs(prev => prev + "\n[UI] Sending request to backend...");

    try {
      const res = await fetch("http://localhost:8008/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "Downloads" })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      // FIX: Use explicit type cast to suppress 'any' value error
      const data: OptimizationResponse = (await res.json()) as OptimizationResponse;

      // FIX: Accessing message property is now safe due to the interface
      setLogs(prev => prev + `\n[UI] Result: ${data.message}`);
    } catch (err) {
      // FIX: Safely log the error object to avoid 'restrict-template-expressions' error
      setLogs(prev => prev + `\n[UI] Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // 3. SIMPLE UI
  const buttonText = isServerReady
    ? (isOptimizing ? "Optimizing..." : "Clean My Downloads Folder")
    : "Waiting for Backend...";

  return (
    <main className="p-10 flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Download Optimizer</h1>

      <button
        // FIX: Wrap the async function call in a synchronous arrow function using 'void'
        onClick={() => { void handleOptimize(); }}
        disabled={isOptimizing || !isServerReady}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {buttonText}
      </button>

      <div className="bg-gray-900 text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
        {logs || "Waiting for backend to start..."}
      </div>
    </main>
  );
}