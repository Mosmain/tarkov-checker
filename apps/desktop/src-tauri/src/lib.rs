mod commands;
mod server;
mod watcher;

use std::sync::Arc;

use tauri::Manager;

use crate::server::config::{self, ConfigStore};
use crate::server::extracts::{self, ExtractsCache};
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
            commands::get_extracts,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = config::data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // Block-on the async loads — we want everything ready before
            // the webview starts running its onMounted hooks. The two
            // files are tiny JSON; this is in the millisecond range.
            let store = tauri::async_runtime::block_on(ConfigStore::load(
                data_dir.join("config.json"),
            ))?;
            let store = Arc::new(store);

            let cache = tauri::async_runtime::block_on(ExtractsCache::load(
                extracts::cache_file(&data_dir),
            ))?;
            let cache = Arc::new(cache);

            let slot = WatcherSlot::default();
            let resolved = paths::resolve(&tauri::async_runtime::block_on(store.overrides()));
            watcher::apply_resolved(&app_handle, &slot, &resolved);

            app.manage(store);
            app.manage(cache);
            app.manage(slot);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
