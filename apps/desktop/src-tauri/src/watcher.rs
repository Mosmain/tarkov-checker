//! Glue around the screenshot + logs watchers: holds the active handles so
//! we can swap them atomically when resolved paths change.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::AppHandle;

use crate::server::logs::{self, LogsWatcher};
use crate::server::paths::ResolvedPaths;
use crate::server::screenshots::{self, ScreenshotWatcher};

/// Tauri-managed state. Cheap to clone, but we don't — we expose it via
/// `State<'_, WatcherSlot>` which gives a `&WatcherSlot`.
#[derive(Default)]
pub struct WatcherSlot {
    screenshots: Mutex<Option<ScreenshotWatcher>>,
    logs: Mutex<Option<LogsWatcher>>,
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
}

/// Apply the resolved paths: start each watcher if its path is usable,
/// otherwise stop any existing one. Errors are logged but don't propagate —
/// the UI already reflects path state via the badge.
pub fn apply_resolved(app: &AppHandle, slot: &WatcherSlot, resolved: &ResolvedPaths) {
    let screenshots_dir = match (&resolved.screenshots_dir.value, resolved.screenshots_dir.exists) {
        (Some(v), true) => Some(PathBuf::from(v)),
        _ => None,
    };
    match screenshots_dir {
        Some(dir) => match screenshots::start(dir, app.clone()) {
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
        Some(dir) => match logs::start(dir, app.clone()) {
            Ok(w) => slot.replace_logs(Some(w)),
            Err(err) => {
                eprintln!("[watcher] logs start failed: {err:#}");
                slot.replace_logs(None);
            }
        },
        None => slot.replace_logs(None),
    }
}
