//! Glue around the screenshot + logs watchers: holds the active handles so
//! we can swap them atomically when resolved paths change.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::AppHandle;
use tokio::sync::broadcast;
use tokio::sync::Mutex as AsyncMutex;

use crate::server::events::{self, ServerEvent};
use crate::server::logs::{self, LogsWatcher};
use crate::server::paths::ResolvedPaths;
use crate::server::screenshots::{self, ScreenshotWatcher};

/// Tauri-managed state. Cheap to clone, but we don't — we expose it via
/// `State<'_, WatcherSlot>` which gives a `&WatcherSlot`.
///
/// `apply_lock` serialises concurrent `apply_resolved` calls so the
/// stop-then-start sequence for each watcher is never interleaved with a
/// parallel call. Without it two concurrent `update_config` IPC commands
/// could each start their own watcher before either has dropped the
/// previous one, producing duplicate file events.
///
/// `event_tx` is the broadcast channel that fan-outs `ServerEvent`s to
/// every connected HTTP `/events` SSE subscriber. The watcher modules
/// receive clones of it to push events from their background threads.
/// The Tauri webview still gets the same events via `app.emit(…)`; both
/// channels are pumped in parallel from the same call site.
///
/// The per-resource `Mutex<Option<…>>` guards the field access within a
/// single `apply_resolved` call and remains `std::sync::Mutex` (not
/// `tokio::sync::Mutex`) because they are only held for the duration of
/// a field swap — no await points inside the lock.
pub struct WatcherSlot {
    apply_lock: AsyncMutex<()>,
    screenshots: Mutex<Option<ScreenshotWatcher>>,
    logs: Mutex<Option<LogsWatcher>>,
    event_tx: broadcast::Sender<ServerEvent>,
    /// "Delete screenshot after parse" toggle. Shared (Arc) so a running
    /// screenshot watcher thread reads the live value — flipping it via
    /// `set_delete_screenshots` takes effect without restarting the watcher.
    delete_screenshots: Arc<AtomicBool>,
}

impl Default for WatcherSlot {
    fn default() -> Self {
        Self::with_sender(events::channel())
    }
}

impl WatcherSlot {
    /// Build a slot around an existing broadcast sender. Used by `run()` /
    /// `run_headless()`, which create the channel up front so the hotkey
    /// press handler can push `Command` events into the same stream the
    /// watchers feed.
    pub fn with_sender(event_tx: broadcast::Sender<ServerEvent>) -> Self {
        Self {
            apply_lock: AsyncMutex::new(()),
            screenshots: Mutex::new(None),
            logs: Mutex::new(None),
            event_tx,
            delete_screenshots: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl WatcherSlot {
    fn replace_screenshots(&self, w: Option<ScreenshotWatcher>) {
        // Drop the previous watcher inside the lock so the underlying
        // notify thread shuts down before the new one starts. Otherwise
        // both could briefly emit duplicate events for the same file.
        let mut guard = self.screenshots.lock().expect("screenshots slot poisoned");
        *guard = w;
    }
    fn replace_logs(&self, w: Option<LogsWatcher>) {
        let mut guard = self.logs.lock().expect("logs slot poisoned");
        *guard = w;
    }
    /// Clone the broadcast sender — used by the HTTP server to derive a
    /// fresh subscriber per SSE connection. Cheap (an Arc bump).
    pub fn event_sender(&self) -> broadcast::Sender<ServerEvent> {
        self.event_tx.clone()
    }

    /// Update the shared delete-screenshots flag. A running watcher reads it
    /// live, so no restart is needed when only this toggle changes.
    pub fn set_delete_screenshots(&self, enabled: bool) {
        self.delete_screenshots.store(enabled, Ordering::Relaxed);
    }
}

/// Apply the resolved paths: start each watcher if its path is usable,
/// otherwise stop any existing one. Errors are logged but don't propagate —
/// the UI already reflects path state via the badge.
///
/// Acquires `apply_lock` for the full duration so that concurrent calls
/// (e.g. two rapid `update_config` IPC commands) are serialised rather
/// than interleaved — preventing duplicate watcher instances.
pub async fn apply_resolved(app: Option<&AppHandle>, slot: &WatcherSlot, resolved: &ResolvedPaths) {
    let _guard = slot.apply_lock.lock().await;

    let screenshots_dir = match (
        &resolved.screenshots_dir.value,
        resolved.screenshots_dir.exists,
    ) {
        (Some(v), true) => Some(PathBuf::from(v)),
        _ => None,
    };
    match screenshots_dir {
        Some(dir) => match screenshots::start(
            dir,
            app.cloned(),
            slot.event_tx.clone(),
            slot.delete_screenshots.clone(),
        ) {
            Ok(w) => slot.replace_screenshots(Some(w)),
            Err(err) => {
                eprintln!("[watcher] screenshots start failed: {err:#}");
                slot.replace_screenshots(None);
            }
        },
        None => slot.replace_screenshots(None),
    }

    let logs_dir = match (&resolved.logs_dir.value, resolved.logs_dir.exists) {
        (Some(v), true) => Some(PathBuf::from(v)),
        _ => None,
    };
    match logs_dir {
        Some(dir) => match logs::start(dir, app.cloned(), slot.event_tx.clone()) {
            Ok(w) => slot.replace_logs(Some(w)),
            Err(err) => {
                eprintln!("[watcher] logs start failed: {err:#}");
                slot.replace_logs(None);
            }
        },
        None => slot.replace_logs(None),
    }
}
