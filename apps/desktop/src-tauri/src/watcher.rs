//! Glue around the screenshot watcher: holds the active handle so we can
//! swap it atomically when the resolved path changes.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::AppHandle;

use crate::server::paths::ResolvedPaths;
use crate::server::screenshots::{self, ScreenshotWatcher};

/// Tauri-managed state. Cheap to clone, but we don't — we expose it via
/// `State<'_, WatcherSlot>` which gives a `&WatcherSlot`.
#[derive(Default)]
pub struct WatcherSlot {
    current: Mutex<Option<ScreenshotWatcher>>,
}

impl WatcherSlot {
    fn replace(&self, w: Option<ScreenshotWatcher>) {
        // Drop the previous watcher inside the lock so the underlying
        // notify thread shuts down before the new one starts. Otherwise
        // both could briefly emit duplicate events for the same file.
        let mut guard = self.current.lock().expect("watcher slot poisoned");
        *guard = w;
    }
}

/// Apply the resolved paths: start the screenshot watcher if the path is
/// usable, otherwise stop any existing watcher. Errors are logged but
/// don't propagate — the UI already reflects path state via the badge.
pub fn apply_resolved(app: &AppHandle, slot: &WatcherSlot, resolved: &ResolvedPaths) {
    let dir = match (&resolved.screenshots_dir.value, resolved.screenshots_dir.exists) {
        (Some(v), true) => PathBuf::from(v),
        _ => {
            slot.replace(None);
            return;
        }
    };
    match screenshots::start(dir, app.clone()) {
        Ok(w) => slot.replace(Some(w)),
        Err(err) => {
            eprintln!("[watcher] start failed: {err:#}");
            slot.replace(None);
        }
    }
}
