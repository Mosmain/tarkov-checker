//! Tauri IPC commands that replace the old Fastify HTTP routes.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::extracts::{ExtractsCache, ExtractsResponse};
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
    slot: State<'_, WatcherSlot>,
) -> Result<ResolvedPaths, String> {
    store.apply(patch).await.map_err(|e| e.to_string())?;
    let resolved = paths::resolve(&store.overrides().await);
    crate::watcher::apply_resolved(&app, slot.inner(), &resolved);
    Ok(resolved)
}

/// `GET /api/extracts?lang=...&refresh=0|1` analogue.
#[tauri::command]
pub async fn get_extracts(
    lang: String,
    refresh: Option<bool>,
    cache: State<'_, Arc<ExtractsCache>>,
) -> Result<ExtractsResponse, String> {
    // Same validation as the TS zod schema: ^[a-z-]+$, 2..=8 chars.
    if !(2..=8).contains(&lang.len())
        || !lang.chars().all(|c| c.is_ascii_lowercase() || c == '-')
    {
        return Err("invalid lang".into());
    }
    let result = if refresh.unwrap_or(false) {
        cache.refresh(&lang).await
    } else {
        cache.get_or_fetch(&lang).await
    };
    result.map_err(|e| e.to_string())
}
