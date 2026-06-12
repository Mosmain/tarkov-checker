//! Tauri IPC commands that replace the old Fastify HTTP routes.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::hotkeys::HotkeyController;
#[cfg(not(debug_assertions))]
use crate::http_server::LISTEN_PORT;
use crate::lan::detect_lan_ip;
use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::events::ServerEvent;
use crate::server::hotkeys::{HotkeyConfig, HotkeyPatch, HotkeyStore};
use crate::server::paths::{self, ConfigResponse};
use crate::watcher::WatcherSlot;

/// Returns the same shape as the old `GET /api/config`.
#[tauri::command]
pub async fn get_config(store: State<'_, Arc<ConfigStore>>) -> Result<ConfigResponse, String> {
    let overrides = store.overrides().await;
    Ok(ConfigResponse {
        paths: paths::resolve(&overrides),
        delete_screenshots: store.delete_screenshots().await,
    })
}

/// `PUT /api/config` analogue. Persists the patch then re-resolves +
/// re-applies the watcher to honour the new path / delete-screenshots flag.
#[tauri::command]
pub async fn update_config(
    app: AppHandle,
    patch: ConfigPatch,
    store: State<'_, Arc<ConfigStore>>,
    slot: State<'_, Arc<WatcherSlot>>,
) -> Result<ConfigResponse, String> {
    store.apply(patch).await.map_err(|e| e.to_string())?;
    let delete_screenshots = store.delete_screenshots().await;
    // Push the new flag to the slot BEFORE re-applying, so the restarted
    // screenshot watcher clones the up-to-date value.
    slot.set_delete_screenshots(delete_screenshots);
    let resolved = paths::resolve(&store.overrides().await);
    crate::watcher::apply_resolved(Some(&app), slot.inner(), &resolved).await;
    Ok(ConfigResponse {
        paths: resolved,
        delete_screenshots,
    })
}

/// `GET /api/hotkeys` analogue — the backend-owned combos.
#[tauri::command]
pub async fn get_hotkeys(store: State<'_, Arc<HotkeyStore>>) -> Result<HotkeyConfig, String> {
    Ok(store.get().await)
}

/// `PUT /api/hotkeys` analogue. Persists the patch then (re)registers the
/// OS-global hotkeys, reverting any field whose combo can't be claimed.
/// Returns the effective config.
#[tauri::command]
pub async fn update_hotkeys(
    patch: HotkeyPatch,
    store: State<'_, Arc<HotkeyStore>>,
    hotkeys: State<'_, Arc<dyn HotkeyController>>,
    slot: State<'_, Arc<WatcherSlot>>,
) -> Result<HotkeyConfig, String> {
    let merged = store.apply(patch).await?;
    let controller = hotkeys.inner().clone();
    let to_apply = merged.clone();
    let effective = tokio::task::spawn_blocking(move || controller.apply(&to_apply))
        .await
        .unwrap_or_else(|_| merged.clone());
    if effective != merged {
        store
            .set(effective.clone())
            .await
            .map_err(|e| e.to_string())?;
    }
    // Tell the other clients (browser/phone over SSE) the config changed —
    // `event_sender()` is the same broadcast channel the /events stream serves.
    let _ = slot.event_sender().send(ServerEvent::Hotkeys {
        config: effective.clone(),
    });
    Ok(effective)
}

/// Drop all OS hotkey binds while the settings recorder captures a combo, so
/// the keystroke reaches the webview instead of firing its action.
#[tauri::command]
pub async fn suspend_hotkeys(hotkeys: State<'_, Arc<dyn HotkeyController>>) -> Result<(), String> {
    let controller = hotkeys.inner().clone();
    let _ = tokio::task::spawn_blocking(move || controller.suspend()).await;
    Ok(())
}

/// Re-claim the OS hotkey binds after the recorder finishes.
#[tauri::command]
pub async fn resume_hotkeys(hotkeys: State<'_, Arc<dyn HotkeyController>>) -> Result<(), String> {
    let controller = hotkeys.inner().clone();
    let _ = tokio::task::spawn_blocking(move || controller.resume()).await;
    Ok(())
}

/// Wire shape for [`pairing_qr`]. Both fields are intended for direct
/// rendering by the webview: `url` shown as copyable text, `svg`
/// inserted via `v-html` (safe — the content originates from this
/// command, never from user input).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingQr {
    /// `http://<lan-ip>:47474/` — the LAN URL of the helper's
    /// embedded SPA. Trust model is same-Wi-Fi, so no token is
    /// embedded: anyone who can reach the URL is on the user's LAN
    /// and is implicitly trusted.
    pub url: String,
    /// Inline SVG of the QR encoding `url`. The webview uses `v-html`
    /// to drop it into the DOM.
    pub svg: String,
}

/// Builds the helper's LAN URL (`http://<lan-ip>:<port>/`). Dev serves the
/// SPA from Vite on :5173; release serves it from the embedded helper on
/// :47474. Errors with "no LAN IP found" when the host has no non-loopback
/// IPv4. Shared by `pairing_qr` and `copy_lan_url`.
fn lan_url() -> Result<String, String> {
    let ip = detect_lan_ip().ok_or_else(|| "no LAN IP found".to_string())?;
    #[cfg(debug_assertions)]
    let port: u16 = 5173;
    #[cfg(not(debug_assertions))]
    let port = LISTEN_PORT;
    Ok(format!("http://{ip}:{port}/"))
}

/// Builds the LAN URL of the helper plus an inline SVG QR for it.
/// Called by `PairingModal.vue` on every open so the URL is fresh each
/// time (LAN IP can change if the user switched Wi-Fi).
///
/// Returns a string error to the webview when:
/// * the host has no non-loopback IPv4 — "no LAN IP found"
/// * the QR encoder rejects the URL (shouldn't happen for short ASCII
///   URLs, but surfaced rather than panicked just in case)
#[tauri::command]
pub async fn pairing_qr() -> Result<PairingQr, String> {
    let url = lan_url()?;
    let code = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(256, 256)
        .build();
    Ok(PairingQr { url, svg })
}

/// Copies the helper's LAN URL to the system clipboard and returns it.
/// Driven by the tray "Copy LAN URL" item: a native clipboard write that
/// works without a DOM user-gesture (tray-menu clicks don't grant one, so
/// `navigator.clipboard` from the webview would be rejected).
#[tauri::command]
pub async fn copy_lan_url(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let url = lan_url()?;
    app.clipboard()
        .write_text(url.clone())
        .map_err(|e| e.to_string())?;
    Ok(url)
}

/// Shows a native OS notification. Driven once by `useCloseConfirm` on the
/// first close-to-tray to tell the user the app keeps running in the tray
/// rather than quitting. Sent from Rust because the window is already hidden
/// by then, so an in-app toast would no longer be visible. Strings are passed
/// in pre-localised by the webview. The toast is attributed to this app's
/// registered AUMID (name + favicon) — see `notify::register_aumid`.
#[tauri::command]
pub async fn notify_tray_hint(app: AppHandle, title: String, body: String) -> Result<(), String> {
    crate::notify::show_toast(&app, &title, &body)
}

/// Asks GitHub whether a newer release exists. `None` = up to date (or the
/// repo has no published releases yet). Network failures surface as `Err` —
/// the webview logs and stays silent, no nagging.
#[tauri::command]
pub async fn check_update() -> Result<Option<crate::updater::UpdateInfo>, String> {
    crate::updater::check().await.map_err(|e| format!("{e:#}"))
}

/// Portable self-update: re-checks GitHub (the webview never supplies a URL,
/// so it can't point the updater anywhere else), downloads the new exe, swaps
/// it in via the rename dance, relaunches and exits. See `updater.rs`.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let info = crate::updater::check()
        .await
        .map_err(|e| format!("{e:#}"))?
        .ok_or_else(|| "already up to date".to_string())?;
    let exe = crate::updater::download_and_swap(&info.download_url)
        .await
        .map_err(|e| format!("{e:#}"))?;
    // --updated: the fresh instance sleeps ~1.5s (main.rs) so this one can
    // release :47474 and the OS hotkeys before it claims them.
    std::process::Command::new(exe)
        .arg("--updated")
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}
