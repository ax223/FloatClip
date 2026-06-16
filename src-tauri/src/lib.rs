mod clipboard;

use tauri::{
    menu::{ContextMenu, Menu, MenuItem},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const BUBBLE: &str = "bubble";
const PANEL: &str = "panel";
const SETTINGS: &str = "settings";
const SOURCE_URL: &str = "https://github.com/ax223/FloatClip";
const BUBBLE_HEIGHT: f64 = 52.0;
// WebView2 keeps a small minimum host width on some Windows builds. Making it
// explicit keeps the visible icon centered and avoids a mystery-sized window.
const BUBBLE_WIDTH: f64 = 136.0;
const PANEL_WIDTH: u32 = 380;
const PANEL_HEIGHT: u32 = 440;
const SETTINGS_WIDTH: u32 = 300;
const SETTINGS_HEIGHT: u32 = 470;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            create_bubble(app.handle())?;
            create_panel(app.handle())?;
            create_settings(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                let _ = show_settings(app.clone());
            }
            "source" => {
                let _ = open_source_url();
            }
            "quit" => quit_app(app.clone()),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            toggle_panel,
            hide_panel,
            popup_bubble_menu,
            delete_local_file,
            get_autostart_enabled,
            load_history,
            persist_image_data_url,
            read_icon_as_data_url,
            read_image_as_data_url,
            read_files_from_clipboard,
            save_history,
            set_autostart_enabled,
            write_files_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("failed to run FloatClip");
}

fn quit_app(app: AppHandle) {
    app.exit(0);
    std::process::exit(0);
}

fn open_source_url() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", SOURCE_URL])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(SOURCE_URL)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(SOURCE_URL)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
}

fn create_bubble(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let position = initial_bubble_position(app, BUBBLE_WIDTH as u32, BUBBLE_HEIGHT as u32);
    let bubble = WebviewWindowBuilder::new(app, BUBBLE, WebviewUrl::App("bubble.html".into()))
        .title("FloatClip Bubble")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(BUBBLE_WIDTH, BUBBLE_HEIGHT)
        .position(position.x as f64, position.y as f64)
        .build()?;

    bubble.show()?;
    bubble.set_always_on_top(true)?;
    Ok(bubble)
}

fn create_panel(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let panel = WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("index.html".into()))
        .title("FloatClip Panel")
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .inner_size(PANEL_WIDTH as f64, PANEL_HEIGHT as f64)
        .build()?;

    let panel_for_event = panel.clone();
    panel.on_window_event(move |event| {
        if matches!(event, WindowEvent::Focused(false)) {
            let _ = panel_for_event.emit("panel-closing", ());
            let panel_to_hide = panel_for_event.clone();
            let _ = panel_for_event.run_on_main_thread(move || {
                std::thread::sleep(std::time::Duration::from_millis(140));
                let _ = panel_to_hide.hide();
            });
        }
    });

    Ok(panel)
}

fn create_settings(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let settings =
        WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
            .title("FloatClip Settings")
            .decorations(false)
            .transparent(true)
            .shadow(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .inner_size(SETTINGS_WIDTH as f64, SETTINGS_HEIGHT as f64)
            .build()?;

    let settings_for_event = settings.clone();
    settings.on_window_event(move |event| {
        if matches!(event, WindowEvent::Focused(false)) {
            let _ = settings_for_event.hide();
        }
    });

    Ok(settings)
}

fn initial_bubble_position(app: &AppHandle, width: u32, height: u32) -> PhysicalPosition<i32> {
    let fallback = PhysicalPosition::new(40, 240);
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return fallback;
    };

    let work = monitor.work_area();
    let margin = 18;
    let x = work.position.x + work.size.width as i32 - width as i32 - margin;
    let y = work.position.y + ((work.size.height as i32 - height as i32) / 2).max(margin);
    PhysicalPosition::new(x.max(work.position.x + margin), y)
}

#[tauri::command]
fn toggle_panel(app: AppHandle) -> Result<(), String> {
    let bubble = app
        .get_webview_window(BUBBLE)
        .ok_or("bubble window missing")?;
    let panel = app
        .get_webview_window(PANEL)
        .ok_or("panel window missing")?;

    if panel.is_visible().map_err(|e| e.to_string())? {
        panel.emit("panel-closing", ()).map_err(|e| e.to_string())?;
        std::thread::sleep(std::time::Duration::from_millis(140));
        panel.hide().map_err(|e| e.to_string())?;
        return Ok(());
    }

    place_window_near_bubble(&bubble, &panel, PANEL_WIDTH, PANEL_HEIGHT)?;
    panel.show().map_err(|e| e.to_string())?;
    panel.set_focus().map_err(|e| e.to_string())?;
    panel.emit("panel-opened", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_panel(app: AppHandle) -> Result<(), String> {
    let panel = app
        .get_webview_window(PANEL)
        .ok_or("panel window missing")?;
    panel.emit("panel-closing", ()).map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(140));
    panel.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn popup_bubble_menu(app: AppHandle) -> Result<(), String> {
    let bubble = app
        .get_webview_window(BUBBLE)
        .ok_or("bubble window missing")?;
    let settings = MenuItem::with_id(&app, "settings", "\u{8bbe}\u{7f6e}", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let source =
        MenuItem::with_id(&app, "source", "\u{5f00}\u{6e90}\u{5730}\u{5740}", true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(&app, "quit", "\u{9000}\u{51fa}", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(&app, &[&settings, &source, &quit]).map_err(|e| e.to_string())?;

    menu.popup(bubble.as_ref().window())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())?;
    } else {
        manager.disable().map_err(|e| e.to_string())?;
    }

    manager.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn write_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    clipboard::write_files_to_clipboard(paths)
}

#[tauri::command]
fn read_files_from_clipboard() -> Result<Vec<String>, String> {
    clipboard::read_files_from_clipboard()
}

#[tauri::command]
fn load_history(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = history_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }

    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_history(app: AppHandle, clips: serde_json::Value) -> Result<(), String> {
    let path = history_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&clips).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn persist_image_data_url(app: AppHandle, id: String, data_url: String) -> Result<String, String> {
    if data_url.len() > 12 * 1024 * 1024 {
        return Err("image is too large".into());
    }

    let (_, encoded) = data_url.split_once(',').ok_or("invalid image data url")?;
    let bytes = base64_decode(encoded)?;
    let images_dir = app_data_dir(&app)?.join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let safe_id: String = id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .collect();
    let path = images_dir.join(format!("{safe_id}.png"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_local_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    let images_dir = app_data_dir(&app)?.join("images");

    if path.exists() && path.starts_with(images_dir) {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn read_icon_as_data_url(path: String) -> Result<String, String> {
    read_file_as_data_url(path, 8 * 1024 * 1024)
}

#[tauri::command]
fn read_image_as_data_url(path: String) -> Result<String, String> {
    read_file_as_data_url(path, 16 * 1024 * 1024)
}

fn read_file_as_data_url(path: String, max_bytes: usize) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > max_bytes {
        return Err("file is too large".into());
    }

    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        _ => "image/png",
    };

    Ok(format!("data:{mime};base64,{}", base64_encode(&bytes)))
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);

        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }

        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            out.push('=');
        }
    }

    out
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0u8;

    for byte in input.bytes().filter(|byte| !byte.is_ascii_whitespace()) {
        if byte == b'=' {
            break;
        }

        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("invalid base64 data".into()),
        } as u32;

        buffer = (buffer << 6) | value;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 0xff) as u8);
        }
    }

    Ok(output)
}

fn history_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("history.json"))
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn show_settings(app: AppHandle) -> Result<(), String> {
    let bubble = app
        .get_webview_window(BUBBLE)
        .ok_or("bubble window missing")?;
    let settings = app
        .get_webview_window(SETTINGS)
        .ok_or("settings window missing")?;

    place_window_near_bubble(&bubble, &settings, SETTINGS_WIDTH, SETTINGS_HEIGHT)?;
    settings.show().map_err(|e| e.to_string())?;
    settings.set_focus().map_err(|e| e.to_string())
}

fn place_window_near_bubble(
    bubble: &WebviewWindow,
    window: &WebviewWindow,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let pos = bubble.outer_position().map_err(|e| e.to_string())?;
    let size = bubble.outer_size().map_err(|e| e.to_string())?;
    let window_size = PhysicalSize::new(width, height);

    let monitor = bubble
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no monitor")?;
    let work_area = monitor.work_area();
    let work_pos = work_area.position;
    let work_size = work_area.size;

    let mut x = pos.x + size.width as i32 + 8;
    let mut y = pos.y - 12;

    if x + window_size.width as i32 > work_pos.x + work_size.width as i32 {
        x = pos.x - window_size.width as i32 - 8;
    }
    if y + window_size.height as i32 > work_pos.y + work_size.height as i32 {
        y = work_pos.y + work_size.height as i32 - window_size.height as i32 - 12;
    }

    window
        .set_position(PhysicalPosition::new(
            x.max(work_pos.x + 12),
            y.max(work_pos.y + 12),
        ))
        .map_err(|e| e.to_string())
}
