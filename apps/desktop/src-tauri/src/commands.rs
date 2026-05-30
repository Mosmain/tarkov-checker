//! Tauri IPC commands that replace the old Fastify HTTP routes.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::auth::AuthToken;
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
