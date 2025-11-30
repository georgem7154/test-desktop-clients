#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Emitter, Manager, Listener}; // Added Listener for cleaner events
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

// 1. REFACTOR: Create a dedicated struct for state
// This is cleaner than passing Arc<Mutex<Option<...>>> everywhere
struct SidecarState {
    process: Mutex<Option<CommandChild>>,
}

// 2. HELPER: The internal logic to spawn the process
fn spawn_backend(handle: &tauri::AppHandle) -> Result<(), String> {
    let state = handle.state::<SidecarState>();
    let mut process_guard = state.process.lock().unwrap();

    // Guard clause: If already running, exit early
    if process_guard.is_some() {
        println!("[Core] Server is already active.");
        return Ok(());
    }

    // Prepare the command
    let cmd = handle.shell().sidecar("main").map_err(|e| e.to_string())?;
    
    // Start the process
    let (mut rx, child) = cmd.spawn().map_err(|e| e.to_string())?;
    
    // Update state
    *process_guard = Some(child);
    println!("[Core] Python server started successfully.");

    // Async Listener Loop
    let h = handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let msg = String::from_utf8_lossy(&bytes);
                    println!("[PY-OUT] {}", msg);
                    let _ = h.emit("sidecar-stdout", msg.into_owned());
                }
                CommandEvent::Stderr(bytes) => {
                    let msg = String::from_utf8_lossy(&bytes);
                    eprintln!("[PY-ERR] {}", msg);
                    let _ = h.emit("sidecar-stderr", msg.into_owned());
                }
                _ => {} // Ignore other events
            }
        }
    });

    Ok(())
}

// 3. HELPER: The internal logic to kill the process
// Using .kill() prevents the "Port 8008 in use" error
fn kill_backend(handle: &tauri::AppHandle) -> bool {
    let state = handle.state::<SidecarState>();
    let mut process_guard = state.process.lock().unwrap();

    if let Some(child) = process_guard.take() {
        let _ = child.kill(); // Hard kill the process
        println!("[Core] Zombie process terminated.");
        return true;
    }
    false
}

// --- TAURI COMMANDS ---

#[tauri::command]
fn start_sidecar(handle: tauri::AppHandle) -> Result<String, String> {
    spawn_backend(&handle)?;
    Ok("Backend initialized.".into())
}

#[tauri::command]
fn shutdown_sidecar(handle: tauri::AppHandle) -> Result<String, String> {
    if kill_backend(&handle) {
        Ok("Backend stopped.".into())
    } else {
        Ok("Backend was not running.".into())
    }
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) {
    if let Ok(fs) = window.is_fullscreen() {
        let _ = window.set_fullscreen(!fs);
    }
}

// --- MAIN ENTRY ---

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            process: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            start_sidecar,
            shutdown_sidecar,
            toggle_fullscreen
        ])
        .setup(|app| {
            // Auto-start on launch
            let handle = app.handle().clone();
            let _ = spawn_backend(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Error initializing Tauri")
        .run(|app_handle, event| {
            // Cleanup on Exit (Cmd+Q or Window Close)
            if let tauri::RunEvent::ExitRequested { .. } = event {
                kill_backend(app_handle);
            }
        });
}