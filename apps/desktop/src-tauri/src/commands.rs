//! Tauri IPC commands that replace the old Fastify HTTP routes.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::auth::AuthToken;
use crate::http_server::LISTEN_PORT;
use crate::lan::detect_lan_ip;
use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::paths::{self, ResolvedPaths};
use crate::watcher::WatcherSlot;

/// Returns the same shape as the old `GET /api/config`.
#[tauri::command]
pub async fn get_config(store: State<'_, Arc<ConfigStore>>) -> Result<ResolvedPaths, String> {
    let overrides = store.overrides().await;
    Ok(paths::resolve(&overrides))
}

/// Returns the local HTTP server's bearer token. The webview uses this
/// to bootstrap a paired browser session — eventually wired into a tray
/// menu "Copy pairing URL" that builds `https://<domain>/#token=<value>`.
/// Safe to expose over IPC: the webview is the same trust boundary as
/// the Rust core (signed bundle), so anyone who can call this already
/// has the token in practice.
#[tauri::command]
pub async fn get_auth_token(token: State<'_, AuthToken>) -> Result<String, String> {
    Ok(token.0.clone())
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
    crate::watcher::apply_resolved(&app, slot.inner(), &resolved).await;
    Ok(resolved)
}

/// Wire shape for [`pairing_qr`]. Both fields are intended for direct
/// rendering by the webview: `url` shown as copyable text, `svg`
/// inserted via `v-html` (safe — the content originates from this
/// command, never from user input).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingQr {
    /// `http://<lan-ip>:47474/#token=<auth-token>`. Token rides in the
    /// fragment so it never lands on the wire — the helper's request
    /// log stays clean, and bookmarks / share-sheets get a truncated
    /// URL by accident-not-disaster.
    pub url: String,
    /// Inline SVG of the QR encoding `url`. The webview uses `v-html`
    /// to drop it into the DOM.
    pub svg: String,
}

/// Builds the LAN pairing URL plus an inline SVG QR for it. Called by
/// the [`PairingModal.vue`] on every `onMounted` so the URL is fresh
/// each time the modal opens (LAN IP / token can change between
/// openings — see PLAN-LAN-AND-TRAY.md "QR refresh").
///
/// Returns a string error to the webview when:
/// * the host has no non-loopback IPv4 — "no LAN IP found"
/// * the QR encoder rejects the URL (shouldn't happen for ASCII URLs
///   under 2 KB, but surfaced rather than panicked just in case)
#[tauri::command]
pub async fn pairing_qr(token: State<'_, AuthToken>) -> Result<PairingQr, String> {
    let ip = detect_lan_ip().ok_or_else(|| "no LAN IP found".to_string())?;
    let url = format!("http://{ip}:{LISTEN_PORT}/#token={}", token.0);
    let code = qrcode::QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
        // 256 px gives a phone scanner enough resolution at typical
        // viewing distance without making the modal feel oversized.
        .min_dimensions(256, 256)
        .build();
    Ok(PairingQr { url, svg })
}
