// SteppePlan desktop shell.
//
// The UI stays the same web app; this Rust process starts the bundled Node
// server (same data format as the CLI prototype), waits for it, and opens a
// native webview window pointed at 127.0.0.1. On exit the server is stopped.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    error::Error,
    fs::OpenOptions,
    io::Write,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread::sleep,
    time::Duration,
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn write_desktop_log(line: &str) {
    if let Ok(home) = std::env::var("HOME") {
        let path = PathBuf::from(home).join(".steppeplan/desktop.log");
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{line}");
        }
    }
}

#[tauri::command]
fn set_ui_zoom(window: tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    if !(0.8..=1.6).contains(&scale) {
        return Err("Масштаб должен быть от 80% до 160%".into());
    }
    write_desktop_log(&format!("[desktop] set_ui_zoom {scale}"));
    window.set_zoom(scale).map_err(|error| error.to_string())
}

struct ServerProcess(Mutex<Option<Child>>);

struct Layout {
    node: PathBuf,
    server_script: PathBuf,
    working_dir: PathBuf,
}

fn find_layout() -> Result<Layout, Box<dyn Error>> {
    let exe_dir = std::env::current_exe()?
        .parent()
        .map(Path::to_path_buf)
        .ok_or("Не удалось определить папку приложения")?;

    // Portable layout: <app>/steppeplan, <app>/node, <app>/app/server/index.mjs
    let bundled_server = exe_dir.join("app/server/index.mjs");
    if bundled_server.exists() {
        let node = exe_dir.join("node");
        if !node.exists() {
            return Err("В сборке отсутствует Node runtime (node).".into());
        }
        return Ok(Layout {
            node,
            server_script: bundled_server,
            working_dir: exe_dir.join("app"),
        });
    }

    // Development layout: target/release/steppeplan → <repo>/server/index.mjs
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let project = project.canonicalize().unwrap_or(project);
    let dev_server = project.join("server/index.mjs");
    if dev_server.exists() {
        return Ok(Layout {
            node: PathBuf::from("node"),
            server_script: dev_server,
            working_dir: project,
        });
    }

    Err("Не найдены файлы SteppePlan (server/index.mjs).".into())
}

fn free_port() -> Result<u16, Box<dyn Error>> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn start_server(layout: &Layout, port: u16) -> Result<Child, Box<dyn Error>> {
    let log_path = std::env::var("HOME")
        .map(|home| PathBuf::from(home).join(".steppeplan/desktop.log"))
        .ok();
    if let Some(path) = &log_path {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    let log = log_path.as_ref().and_then(|path| {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .ok()
    });
    let stderr = log
        .as_ref()
        .and_then(|file| file.try_clone().ok())
        .map(Stdio::from)
        .unwrap_or_else(Stdio::inherit);
    let stdout = log.map(Stdio::from).unwrap_or_else(Stdio::inherit);

    let mut command = Command::new(&layout.node);
    command
        .arg(&layout.server_script)
        .current_dir(&layout.working_dir)
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("STEPPEPLAN_DESKTOP", "1")
        .env("STEPPEPLAN_APP_VERSION", env!("CARGO_PKG_VERSION"))
        .stdout(stdout)
        .stderr(stderr);

    let absolute_node = layout
        .node
        .canonicalize()
        .unwrap_or_else(|_| layout.node.clone());
    if absolute_node.is_absolute() {
        command.env("STEPPEPLAN_NODE_BIN", absolute_node);
    }

    if let Some(log_path) = log_path {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
            let _ = writeln!(
                file,
                "\n[desktop] {} starting server on 127.0.0.1:{port}",
                chrono_like_timestamp()
            );
        }
    }

    Ok(command.spawn()?)
}

fn chrono_like_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("unix={}", now.as_secs())
}

fn wait_for_server(port: u16) {
    for _ in 0..150 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        sleep(Duration::from_millis(100));
    }
}

fn main() {
    // MCP mode is intentionally handled in a future desktop release; today the
    // portable package ships a stable ~/.local/bin/steppeplan-mcp wrapper.
    let layout = match find_layout() {
        Ok(layout) => layout,
        Err(error) => {
            eprintln!("[steppeplan] {error}");
            std::process::exit(1);
        }
    };
    let port = match free_port() {
        Ok(port) => port,
        Err(error) => {
            eprintln!("[steppeplan] {error}");
            std::process::exit(1);
        }
    };
    let child = match start_server(&layout, port) {
        Ok(child) => child,
        Err(error) => {
            eprintln!("[steppeplan] Не удалось запустить локальный сервер: {error}");
            std::process::exit(1);
        }
    };
    wait_for_server(port);

    let url = format!("http://127.0.0.1:{port}/")
        .parse()
        .expect("valid local url");

    let app = tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(Some(child))))
        .invoke_handler(tauri::generate_handler![set_ui_zoom])
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("SteppePlan")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1080.0, 700.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build SteppePlan");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<ServerProcess>() {
                if let Some(mut child) = state.0.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}
