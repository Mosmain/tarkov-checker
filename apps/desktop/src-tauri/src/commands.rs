//! Tauri IPC commands that replace the old Fastify HTTP routes.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

#[cfg(not(debug_assertions))]
use crate::http_server::LISTEN_PORT;
use crate::hotkeys::HotkeyController;
use crate::lan::detect_lan_ip;
use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::events::ServerEvent;
use crate::server::hotkeys::{HotkeyConfig, HotkeyPatch, HotkeyStore};
use crate::server::paths::{self, ResolvedPaths};
use crate::watcher::WatcherSlot;

/// Returns the same shape as the old `GET /api/config`.
#[tauri::command]
pub async fn get_config(store: State<'_, Arc<ConfigStore>>) -> Result<ResolvedPaths, String> {
    let overrides = store.overrides().await;
    Ok(paths::resolve(&overrides))
}

/// `PUT /api/config` analogue. Persists the patch then re-resolves +
/// re-applies the watcher to honour the new path.
#[tauri::command]
pub async fn update_config(
    app: AppHandle,
    patch: ConfigPatch,
    store: State<'_, Arc<ConfigStore>>,
    slot: State<'_, Arc<WatcherSlot>>,
) -> Result<ResolvedPaths, String> {
    store.apply(patch).await.map_err(|e| e.to_string())?;
    let resolved = paths::resolve(&store.overrides().await);
    crate::watcher::apply_resolved(Some(&app), slot.inner(), &resolved).await;
    Ok(resolved)
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
        store.set(effective.clone()).await.map_err(|e| e.to_string())?;
    }
    // Tell the other clients (browser/phone over SSE) the config changed —
    // `event_sender()` is the same broadcast channel the /events stream serves.
    let _ = slot
        .event_sender()
        .send(ServerEvent::Hotkeys { config: effective.clone() });
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
    let ip = detect_lan_ip().ok_or_else(|| "no LAN IP found".to_string())?;
    // Dev: Vite serves the SPA on :5173. Release: helper serves it on :47474.
    #[cfg(debug_assertions)]
    let port: u16 = 5173;
    #[cfg(not(debug_assertions))]
    let port = LISTEN_PORT;
    let url = format!("http://{ip}:{port}/");
    let code = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(256, 256)
        .build();
    Ok(PairingQr { url, svg })
}
