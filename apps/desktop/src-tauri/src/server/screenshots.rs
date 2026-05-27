//! Port of `apps/server/src/watchers/screenshots.ts` + the parsing
//! helpers from `packages/shared/src/parse-screenshot.ts`.

use anyhow::{Context, Result};
use notify::{EventKind, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebouncedEvent, Debouncer, FileIdMap};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const NUM: &str = r"-?\d+(?:\.\d+)?";
static POSITION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(r"_({NUM}),\s*({NUM}),\s*({NUM})_")).expect("static regex")
});
static ORIENTATION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"_({NUM}),\s*({NUM}),\s*({NUM})_({NUM}),\s*({NUM}),\s*({NUM}),\s*({NUM})_"
    ))
    .expect("static regex")
});

#[derive(Debug, Clone, Copy)]
pub struct Position3d {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct Quaternion {
    pub qx: f64,
    pub qy: f64,
    pub qz: f64,
    pub qw: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct ParsedScreenshot {
    pub position: Position3d,
    pub orientation: Option<Quaternion>,
}

fn basename(p: &Path) -> Option<&str> {
    p.file_name().and_then(|n| n.to_str())
}

/// Parse the Tarkov F12-overlay screenshot filename. See the TS original
/// for the format reference.
pub fn parse_screenshot_filename(path: &Path) -> Option<ParsedScreenshot> {
    let base = basename(path)?;
    if !base.to_ascii_lowercase().ends_with(".png") {
        return None;
    }
    let pos = POSITION_RE.captures(base)?;
    let x = pos.get(1)?.as_str().parse::<f64>().ok()?;
    let y = pos.get(2)?.as_str().parse::<f64>().ok()?;
    let z = pos.get(3)?.as_str().parse::<f64>().ok()?;
    if ![x, y, z].iter().all(|v| v.is_finite()) {
        return None;
    }

    let orientation = ORIENTATION_RE.captures(base).and_then(|m| {
        let qx = m.get(4)?.as_str().parse::<f64>().ok()?;
        let qy = m.get(5)?.as_str().parse::<f64>().ok()?;
        let qz = m.get(6)?.as_str().parse::<f64>().ok()?;
        let qw = m.get(7)?.as_str().parse::<f64>().ok()?;
        if [qx, qy, qz, qw].iter().all(|v| v.is_finite()) {
            Some(Quaternion { qx, qy, qz, qw })
        } else {
            None
        }
    });

    Some(ParsedScreenshot {
        position: Position3d { x, y, z },
        orientation,
    })
}

/// Yaw in degrees from a Tarkov orientation quaternion. Direct port of
/// `quaternionToYawDegrees` in TS; see that doc-comment for axis convention.
pub fn quaternion_to_yaw_degrees(q: Quaternion) -> f64 {
    let sin_yaw = 2.0 * (q.qw * q.qy + q.qz * q.qx);
    let cos_yaw = 1.0 - 2.0 * (q.qx * q.qx + q.qy * q.qy);
    sin_yaw.atan2(cos_yaw).to_degrees()
}

#[derive(Debug, Clone, Serialize)]
struct PositionPayload {
    t: i64,
    x: f64,
    y: f64,
    z: f64,
    yaw: Option<f64>,
}

/// Owns the notify debouncer + the reader thread. Drop = stop.
pub struct ScreenshotWatcher {
    // Hold the debouncer alive; dropping it stops the underlying watcher.
    _debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
}

/// Start watching `dir` non-recursively. New .png files matching the F12
/// overlay pattern emit a `position` event on the AppHandle.
///
/// chokidar's `awaitWriteFinish: { stabilityThreshold: 250 }` is mirrored
/// here by the debouncer's 250 ms timeout — only events that have been
/// quiet for the whole window are reported.
pub fn start(dir: PathBuf, app: AppHandle) -> Result<ScreenshotWatcher> {
    let (tx, rx) = mpsc::channel::<notify_debouncer_full::DebounceEventResult>();
    let mut debouncer = new_debouncer(Duration::from_millis(250), None, tx)
        .context("create fs debouncer")?;
    debouncer
        .watcher()
        .watch(&dir, RecursiveMode::NonRecursive)
        .with_context(|| format!("watch {}", dir.display()))?;
    // notify-debouncer-full's FileIdMap caches inode-style ids; tell it to
    // stop tracking the parent so we don't grow it unboundedly over a
    // long session.
    debouncer
        .cache()
        .add_root(&dir, RecursiveMode::NonRecursive);

    // Reader thread — exits when the sender side of `rx` is dropped along
    // with the debouncer.
    let app_handle = app.clone();
    std::thread::Builder::new()
        .name("screenshot-watcher".into())
        .spawn(move || {
            for batch in rx {
                let events = match batch {
                    Ok(ev) => ev,
                    Err(_) => continue,
                };
                for ev in events {
                    handle_event(&app_handle, ev);
                }
            }
        })
        .context("spawn watcher thread")?;

    Ok(ScreenshotWatcher {
        _debouncer: debouncer,
    })
}

fn handle_event(app: &AppHandle, ev: DebouncedEvent) {
    // Only fresh-on-disk files matter — chokidar in TS used the `add`
    // event which fires on initial discovery + new creates. notify's
    // `Create` covers the same case; we also accept `Modify(Name(Any))`
    // for atomic renames some screenshot tools use.
    let interesting = matches!(
        ev.kind,
        EventKind::Create(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
    );
    if !interesting {
        return;
    }
    for path in &ev.paths {
        let Some(parsed) = parse_screenshot_filename(path) else {
            continue;
        };
        let yaw = parsed.orientation.map(quaternion_to_yaw_degrees);
        let payload = PositionPayload {
            t: chrono_now_ms(),
            x: parsed.position.x,
            y: parsed.position.y,
            z: parsed.position.z,
            yaw,
        };
        if let Err(err) = app.emit("position", &payload) {
            eprintln!("[screenshot-watcher] emit failed: {err}");
        }
    }
}

fn chrono_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
