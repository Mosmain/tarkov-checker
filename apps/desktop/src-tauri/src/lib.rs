mod commands;
mod hotkeys;
mod http_server;
mod lan;
mod notify;
mod server;
mod updater;
mod watcher;

use std::sync::{Arc, Mutex};

use global_hotkey::hotkey::HotKey;
use std::str::FromStr;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

use crate::hotkeys::{HotkeyController, StandaloneHotkeys, TauriHotkeys};
use crate::server::config::{self, ConfigStore};
use crate::server::events::{self, CommandPayload, ServerEvent};
use crate::server::hotkeys::HotkeyStore;
use crate::server::paths;
use crate::watcher::WatcherSlot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The five forwarded hotkey combos must be known before the plugin is
    // built (its Builder registers them directly, dodging the
    // run_on_main_thread deadlock that registering during our own setup hook
    // would hit). So load the store + seed the id→action map up front.
    let data_dir = config::data_dir().expect("resolve data dir");
    std::fs::create_dir_all(&data_dir).expect("create data dir");
    let hotkey_store = Arc::new(
        tauri::async_runtime::block_on(HotkeyStore::load(data_dir.join("hotkeys.json")))
            .expect("load hotkeys.json"),
    );
    let hotkey_cfg = tauri::async_runtime::block_on(hotkey_store.get());

    // Shared with the plugin press-handler below AND TauriHotkeys (which
    // mutates it on re-register). std::sync::Mutex — only held for a map
    // lookup/swap, no awaits.
    let action_map = Arc::new(Mutex::new(hotkeys::action_map(&hotkey_cfg)));
    // Only register combos that actually parse (a hand-corrupted hotkeys.json
    // shouldn't crash startup); the rest are dropped + logged.
    let initial_combos: Vec<String> = hotkeys::config_combos(&hotkey_cfg)
        .into_iter()
        .filter(|c| HotKey::from_str(c).is_ok())
        .collect();

    // Created up front so the press-handler can fan presses into the same
    // broadcast stream the watchers feed; shared with WatcherSlot in setup.
    let event_tx = events::channel();

    let handler_tx = event_tx.clone();
    let handler_map = action_map.clone();
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts(initial_combos.iter().map(|s| s.as_str()))
        .expect("default hotkey combos must parse")
        .with_handler(move |app, shortcut, event| {
            // Plugin fires Pressed + Released — act on Pressed only.
            if event.state != ShortcutState::Pressed {
                return;
            }
            // The lock combo (JS-registered) also reaches this global handler
            // but isn't in the action map → ignored here, handled client-side.
            let action = handler_map
                .lock()
                .ok()
                .and_then(|m| m.get(&shortcut.id()).copied());
            if let Some(action) = action {
                let _ = handler_tx.send(ServerEvent::Command { action });
                let _ = app.emit("command", CommandPayload { action });
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(shortcut_plugin)
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::update_config,
            commands::get_hotkeys,
            commands::update_hotkeys,
            commands::suspend_hotkeys,
            commands::resume_hotkeys,
            commands::pairing_qr,
            commands::copy_lan_url,
            commands::notify_tray_hint,
            commands::check_update,
            commands::install_update,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Sweep the `.old.exe` a previous self-update left behind.
            updater::cleanup_old();

            // Register our AppUserModelID (name + favicon) so the tray-hint
            // toast is attributed to this app instead of PowerShell.
            notify::register_aumid(&app_handle, &data_dir);

            // Block-on the async load — we want the config ready before
            // the webview starts running its onMounted hooks. Tiny JSON;
            // this is in the millisecond range.
            let store =
                tauri::async_runtime::block_on(ConfigStore::load(data_dir.join("config.json")))?;
            let store = Arc::new(store);

            // Reuse the up-front broadcast sender so hotkey `Command` events
            // and watcher events share one stream.
            let slot = Arc::new(WatcherSlot::with_sender(event_tx.clone()));
            slot.set_delete_screenshots(tauri::async_runtime::block_on(store.delete_screenshots()));
            let resolved = paths::resolve(&tauri::async_runtime::block_on(store.overrides()));
            tauri::async_runtime::block_on(watcher::apply_resolved(
                Some(&app_handle),
                &slot,
                &resolved,
            ));

            // Hotkey controller shares the same id→action map the plugin
            // handler reads, so a PUT re-registration keeps them in lockstep.
            let hotkeys: Arc<dyn HotkeyController> = Arc::new(TauriHotkeys::new(
                app_handle.clone(),
                action_map.clone(),
                hotkey_cfg.clone(),
            ));

            app.manage(store.clone());
            app.manage(slot.clone());
            app.manage(hotkey_store.clone());
            app.manage(hotkeys.clone());

            // Companion HTTP server. Spawned independently of the
            // watcher pipeline — a bind failure does not block the
            // Tauri webview path.
            http_server::spawn(http_server::Deps {
                config_store: store,
                watcher_slot: slot,
                app_handle: Some(app_handle.clone()),
                hotkey_store: hotkey_store.clone(),
                hotkeys: hotkeys.clone(),
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
        let hotkey_store = match HotkeyStore::load(data_dir.join("hotkeys.json")).await {
            Ok(s) => Arc::new(s),
            Err(e) => {
                eprintln!("[headless] load hotkeys: {e:#}");
                return;
            }
        };
        // One broadcast stream shared by the watchers and the hotkey thread.
        let event_tx = events::channel();
        let slot = Arc::new(WatcherSlot::with_sender(event_tx.clone()));
        slot.set_delete_screenshots(store.delete_screenshots().await);
        let resolved = paths::resolve(&store.overrides().await);
        watcher::apply_resolved(None, &slot, &resolved).await;

        // No Tauri/plugin event loop here, so use the standalone manager —
        // it runs its own Win32 message pump on a dedicated thread.
        let hotkey_cfg = hotkey_store.get().await;
        let hotkeys: Arc<dyn HotkeyController> =
            Arc::new(StandaloneHotkeys::spawn(event_tx.clone(), hotkey_cfg));

        http_server::spawn(http_server::Deps {
            config_store: store,
            watcher_slot: slot,
            app_handle: None,
            hotkey_store,
            hotkeys,
        });
        eprintln!("[headless] tarkov-checker backend up — http://0.0.0.0:47474 (Ctrl+C to stop)");
        std::future::pending::<()>().await;
    });
}

/// Reposition the window if the window-state plugin restored coordinates that
/// land off every current monitor (monitor layout changed between sessions).
fn clamp_window_to_monitor(window: &tauri::WebviewWindow) {
    const MIN_OVERLAP: i32 = 48;

    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(monitors) = window.available_monitors() else {
        return;
    };

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
