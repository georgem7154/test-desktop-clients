"use client"
import { useEffect, useState, useRef } from "react";
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface OptimizationResponse {
  message: string;
}

// Helper function for safer error handling (avoids 'any' in catch)
const handleError = (err: unknown, prefix: string): string => {
  if (err instanceof Error) {
    return `\n${prefix} Error: ${err.message}`;
  }
  return `\n${prefix} Unknown Error: ${String(err)}`;
};

export default function Home() {
  const [logs, setLogs] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isServerReady, setIsServerReady] = useState(false);

  const hasInitialized = useRef(false);

  // --- HEALTH CHECK POLLER ---
  // Tries to connect to the backend every 1 second until successful
  const waitForBackend = async () => {
    let attempts = 0;
    const maxAttempts = 30; // Stop after 30 seconds

    while (attempts < maxAttempts) {
      try {
        // The /health endpoint must exist on your FastAPI server
        const res = await fetch("http://localhost:8008/health"); 
        if (res.ok) {
          setIsServerReady(true);
          setLogs(prev => prev + "\n[UI] ✅ Health check passed. Backend is ready.");
          return; // Exit loop on success
        }
      } catch (err: unknown) { // FIX: Use : unknown in catch block
        // Silent fail: server isn't ready yet, just wait and retry
        // We avoid logging the error here as it happens every second initially
      }

      attempts++;
      // Wait 1 second before next try
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setLogs(prev => prev + "\n[UI] ❌ Timeout: Backend failed to start.");
  };

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    let unlisten: (() => void) | undefined;

    const setupLifecycle = async () => {
      // 1. LISTEN FOR LOGS (Purely for debugging now)
      unlisten = await listen('sidecar-stdout', (event) => {
        const message = String(event.payload);
        setLogs(prev => prev + `\n${message}`);
      });

      await listen('sidecar-stderr', (event) => {
        const message = String(event.payload);
        setLogs(prev => prev + `\n[PY-ERR] ${message}`);
      });

      // 2. START SIDECAR
      setLogs(prev => prev + "\n[UI] Starting Sidecar...");
      
      // FIX: Use : unknown in catch block and use the safe error handler
      await invoke("start_sidecar").catch((err: unknown) => { 
        setLogs(prev => prev + handleError(err, "[UI] ❌ Failed to start sidecar"));
      });

      // 3. START POLLING HEALTH ENDPOINT
      setLogs(prev => prev + "\n[UI] Waiting for health check...");
      await waitForBackend();
    };

    void setupLifecycle();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleOptimize = async () => {
    if (!isServerReady) return;

    setIsOptimizing(true);
    setLogs(prev => prev + "\n[UI] Sending request...");

    try {
      const res = await fetch("http://localhost:8008/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "Downloads" })
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = (await res.json()) as OptimizationResponse;
      setLogs(prev => prev + `\n[UI] Result: ${data.message}`);
      
    } catch (err: unknown) { // FIX: Use : unknown in catch block
      setLogs(prev => prev + handleError(err, "[UI]"));
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <main className="p-10 flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Download Optimizer</h1>

      <button
        // FIX: The ESLint rule `void` in `onClick` is for side-effect methods.
        // It's already correctly handled here, but if the rule complains,
        // you can change this to: onClick={handleOptimize}
        onClick={() => { void handleOptimize(); }} 
        disabled={isOptimizing || !isServerReady}
        className={`px-4 py-2 rounded text-white transition-all ${
          isServerReady
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-gray-500 cursor-not-allowed"
        }`}
      >
        {isServerReady
          ? (isOptimizing ? "Optimizing..." : "Clean My Downloads Folder")
          : "Starting Backend..."}
      </button>

      <div className="bg-gray-900 text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-sm whitespace-pre-wrap border border-gray-700">
        {logs || "Initializing..."}
      </div>
    </main>
  );
}
