mod auth;
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
            commands::get_auth_token,
            commands::get_config,
            commands::update_config,
            commands::pairing_qr,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Load (or first-run-create) the HTTP auth token from Windows
            // Credential Manager. Failure here is fatal: without a token
            // the HTTP server cannot safely accept external requests, and
            // the Tauri webview path is the only thing left working.
            let auth_token = auth::load_or_create()?;

            let data_dir = config::data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // Block-on the async load — we want the config ready before
            // the webview starts running its onMounted hooks. Tiny JSON;
            // this is in the millisecond range.
            let store =
                tauri::async_runtime::block_on(ConfigStore::load(data_dir.join("config.json")))?;
            let store = Arc::new(store);

            // Arc-wrap up front so the same instance can be reached via
            // Tauri state (for IPC commands) and via http_server::Deps
            // (for the protected HTTP routes). Cheap clones, no double
            // state to keep in sync.
            let slot = Arc::new(WatcherSlot::default());
            let resolved = paths::resolve(&tauri::async_runtime::block_on(store.overrides()));
            tauri::async_runtime::block_on(watcher::apply_resolved(&app_handle, &slot, &resolved));

            app.manage(store.clone());
            app.manage(slot.clone());

            // Optional companion HTTP server for the browser-as-frontend
            // mode. Spawned independently of the watcher pipeline — a
            // bind failure does not block the Tauri webview path.
            http_server::spawn(http_server::Deps {
                auth_token: auth_token.clone(),
                config_store: store,
                watcher_slot: slot,
                app_handle: app_handle.clone(),
            });
            // Same token also exposed via IPC so the webview / future
            // tray menu can build the pairing URL.
            app.manage(auth::AuthToken(auth_token));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
