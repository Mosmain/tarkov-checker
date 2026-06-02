mod commands;
mod http_server;
mod lan;
mod server;
mod watcher;

use std::sync::Arc;

use tauri::Manager;

use crate::server::config::{self, ConfigStore};
use crate::server::paths;
use crate::watcher::WatcherSlot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::update_config,
            commands::pairing_qr,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            let data_dir = config::data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // Block-on the async load — we want the config ready before
            // the webview starts running its onMounted hooks. Tiny JSON;
            // this is in the millisecond range.
            let store =
                tauri::async_runtime::block_on(ConfigStore::load(data_dir.join("config.json")))?;
            let store = Arc::new(store);

            // Arc-wrap up front so the same instance can be reached via
            // Tauri state (for IPC commands) and via http_server::Deps.
            // Cheap clones, no double state to keep in sync.
            let slot = Arc::new(WatcherSlot::default());
            let resolved = paths::resolve(&tauri::async_runtime::block_on(store.overrides()));
            tauri::async_runtime::block_on(watcher::apply_resolved(Some(&app_handle), &slot, &resolved));

            app.manage(store.clone());
            app.manage(slot.clone());

            // Companion HTTP server. Spawned independently of the
            // watcher pipeline — a bind failure does not block the
            // Tauri webview path.
            http_server::spawn(http_server::Deps {
                config_store: store,
                watcher_slot: slot,
                app_handle: Some(app_handle.clone()),
            });

            // Clamp restored window onto a visible monitor (handles 2K→FHD moves).
            if let Some(win) = app.get_webview_window("main") {
                clamp_window_to_monitor(&win);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Run only the HTTP server + filesystem watchers (no Tauri window). Lets a
/// browser / LAN client use the helper without launching the overlay.
pub fn run_headless() {
    tauri::async_runtime::block_on(async {
        let data_dir = match config::data_dir() {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[headless] config dir: {e:#}");
                return;
            }
        };
        if let Err(e) = std::fs::create_dir_all(&data_dir) {
            eprintln!("[headless] create data dir: {e:#}");
            return;
        }
        let store = match ConfigStore::load(data_dir.join("config.json")).await {
            Ok(s) => Arc::new(s),
            Err(e) => {
                eprintln!("[headless] load config: {e:#}");
                return;
            }
        };
        let slot = Arc::new(WatcherSlot::default());
        let resolved = paths::resolve(&store.overrides().await);
        watcher::apply_resolved(None, &slot, &resolved).await;
        http_server::spawn(http_server::Deps {
            config_store: store,
            watcher_slot: slot,
            app_handle: None,
        });
        eprintln!("[headless] tarkov-checker backend up — http://0.0.0.0:47474 (Ctrl+C to stop)");
        std::future::pending::<()>().await;
    });
}

/// Reposition the window if the window-state plugin restored coordinates that
/// land off every current monitor (monitor layout changed between sessions).
fn clamp_window_to_monitor(window: &tauri::WebviewWindow) {
    const MIN_OVERLAP: i32 = 48;

    let Ok(pos) = window.outer_position() else { return };
    let Ok(size) = window.outer_size() else { return };
    let Ok(monitors) = window.available_monitors() else { return };

    if monitors.is_empty() {
        return;
    }

    let wx1 = pos.x;
    let wy1 = pos.y;
    let wx2 = wx1 + size.width as i32;
    let wy2 = wy1 + size.height as i32;

    let on_screen = monitors.iter().any(|m| {
        let mx1 = m.position().x;
        let my1 = m.position().y;
        let mx2 = mx1 + m.size().width as i32;
        let my2 = my1 + m.size().height as i32;

        let ix = (wx2.min(mx2) - wx1.max(mx1)).max(0);
        let iy = (wy2.min(my2) - wy1.max(my1)).max(0);
        ix >= MIN_OVERLAP && iy >= MIN_OVERLAP
    });

    if on_screen {
        return;
    }

    // Pick primary → first available → current.
    let target = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next())
        .or_else(|| window.current_monitor().ok().flatten());

    if let Some(m) = target {
        const MARGIN: i32 = 40;
        let nx = m.position().x + MARGIN;
        let ny = m.position().y + MARGIN;
        let _ = window.set_position(tauri::PhysicalPosition::new(nx, ny));
    }
}
