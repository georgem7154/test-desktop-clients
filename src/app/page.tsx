"use client"
import { useEffect, useState } from "react";
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export default function Home() {
  const [logs, setLogs] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);

  // 1. LISTEN FOR LOGS (Python print statements)
  useEffect(() => {
    // Start the sidecar automatically when app loads
    invoke("start_sidecar").catch(console.error);

    const setupListeners = async () => {
      const unlisten = await listen('sidecar-stdout', (event) => {
        const message = String(event.payload);
        setLogs(prev => prev + `\n${message}`);
      });
      return unlisten;
    };

    const unlistenPromise = setupListeners();

    // Cleanup listener on unmount
    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  // 2. TRIGGER OPTIMIZATION
  const handleOptimize = async () => {
    setIsOptimizing(true);
    setLogs(prev => prev + "\n[UI] Sending request to backend...");

    try {
      // Assuming your Python backend has an endpoint like /optimize
      // You can pass params here (e.g., specific folder path)
      const res = await fetch("http://localhost:8008/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "Downloads" })
      });

      const data = await res.json();
      setLogs(prev => prev + `\n[UI] Result: ${data.message}`);
    } catch (err) {
      setLogs(prev => prev + `\n[UI] Error: ${err}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // 3. SIMPLE UI
  return (
    <main className="p-10 flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Download Optimizer</h1>

      <button
        onClick={handleOptimize}
        disabled={isOptimizing}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isOptimizing ? "Optimizing..." : "Clean My Downloads Folder"}
      </button>

      <div className="bg-gray-900 text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-sm whitespace-pre-wrap">
        {logs || "Waiting for command..."}
      </div>
    </main>
  );
}