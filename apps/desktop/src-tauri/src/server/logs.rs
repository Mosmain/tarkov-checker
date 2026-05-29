//! Port of `apps/server/src/watchers/logs.ts` + the parser helper from
//! `packages/shared/src/parse-log.ts`. Parser regex is mirrored literally —
//! both ports must extract the same `rawMapId` from any given line.

use anyhow::{Context, Result};
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const SESSION_FOLDER_PREFIX: &str = "log_";

static SCENE_PRESET_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\brcid:([A-Za-z0-9_]+)\.scenespreset\.asset\b").expect("static regex"));
static TRANSIT_LOCATION_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\[Transit\].*\bLocations:([A-Za-z0-9_]+)").expect("static regex"));
static TRACE_LOCATION_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bLocation:\s+([A-Za-z0-9_]+)\s*,\s*Sid:").expect("static regex"));
static APPLICATION_LOG_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^.+ application_(\d+)\.log$").expect("static regex"));

/// Pure parser — direct port of `parseLogLine` in TS. See that doc-comment
/// for the format reference. Result is lowercased so callers can use it as
/// a stable lookup key against the canonical map alphabet.
pub fn parse_log_line(line: &str) -> Option<String> {
    let m = SCENE_PRESET_RE
        .captures(line)
        .or_else(|| TRANSIT_LOCATION_RE.captures(line))
        .or_else(|| TRACE_LOCATION_RE.captures(line))?;
    Some(m.get(1)?.as_str().to_ascii_lowercase())
}

#[derive(Debug, Clone, Serialize)]
struct MapChangePayload {
    t: i64,
    #[serde(rename = "rawMapId")]
    raw_map_id: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// State machine kept inside the Mutex. `offset` is `None` until a log file
/// is actually open; the folder may exist before any application_NNN.log is
/// written to it (very early in a game launch).
struct State {
    last_emitted_map_id: Option<String>,
    active_folder: Option<PathBuf>,
    active_log: Option<ActiveLog>,
}

struct ActiveLog {
    path: PathBuf,
    suffix: u32,
    offset: u64,
    partial: String,
}

fn list_session_folders(logs_dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = match fs::read_dir(logs_dir) {
        Ok(it) => it
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.starts_with(SESSION_FOLDER_PREFIX))
                    .unwrap_or(false)
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    out.sort();
    out
}

fn pick_latest_application_log(folder: &Path) -> Option<(PathBuf, u32)> {
    let entries = fs::read_dir(folder).ok()?;
    let mut best: Option<(PathBuf, u32)> = None;
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else { continue };
        let Some(caps) = APPLICATION_LOG_RE.captures(name_str) else { continue };
        let Some(suffix_str) = caps.get(1).map(|m| m.as_str()) else { continue };
        let Ok(suffix) = suffix_str.parse::<u32>() else { continue };
        if best.as_ref().map_or(true, |(_, s)| suffix > *s) {
            best = Some((entry.path(), suffix));
        }
    }
    best
}

/// Reads up to the last `WINDOW` bytes of the file and scans backwards for
/// the most recent line that yields a mapId. Used once on startup so the
/// overlay snaps to the right map when Tarkov is already mid-raid.
fn find_latest_map_id_in_file(path: &Path) -> Option<String> {
    const WINDOW: u64 = 64 * 1024;
    let mut file = File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    if size == 0 {
        return None;
    }
    let read_from = size.saturating_sub(WINDOW);
    file.seek(SeekFrom::Start(read_from)).ok()?;
    let mut buf = Vec::with_capacity((size - read_from) as usize);
    file.read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    for line in text.lines().rev() {
        if let Some(id) = parse_log_line(line) {
            return Some(id);
        }
    }
    None
}

fn emit_map_change(app: &AppHandle, state: &Mutex<State>, raw_map_id: String) {
    let mut guard = state.lock().expect("logs state poisoned");
    if guard
        .last_emitted_map_id
        .as_deref()
        .is_some_and(|prev| prev == raw_map_id)
    {
        return;
    }
    guard.last_emitted_map_id = Some(raw_map_id.clone());
    drop(guard);

    let payload = MapChangePayload {
        t: now_ms(),
        raw_map_id,
    };
    if let Err(err) = app.emit("map-change", &payload) {
        eprintln!("[logs-watcher] emit failed: {err}");
    }
}

/// Seek + read appended bytes for the currently-tailed log file, parse line
/// by line, emit on hit. Idempotent — safe to call on every poll tick.
fn read_appended(app: &AppHandle, state: &Mutex<State>) {
    // Snapshot the path + offset under the lock so the actual I/O happens
    // outside it.
    let snapshot: Option<(PathBuf, u64, String)> = {
        let guard = state.lock().expect("logs state poisoned");
        guard
            .active_log
            .as_ref()
            .map(|a| (a.path.clone(), a.offset, a.partial.clone()))
    };
    let Some((path, mut offset, mut partial)) = snapshot else {
        return;
    };

    let Ok(metadata) = fs::metadata(&path) else { return };
    let size = metadata.len();
    if size < offset {
        // Truncation / rotation — restart from the top.
        offset = 0;
        partial.clear();
    }
    if size == offset {
        return;
    }

    let Ok(mut file) = File::open(&path) else { return };
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return;
    }
    let to_read = (size - offset) as usize;
    let mut buf = vec![0u8; to_read];
    let read_bytes = match file.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return,
    };
    buf.truncate(read_bytes);
    offset += read_bytes as u64;

    partial.push_str(&String::from_utf8_lossy(&buf));
    let mut lines: Vec<&str> = partial.split('\n').collect();
    // The trailing piece is whatever follows the last '\n' — keep it for
    // the next tick.
    let leftover = lines.pop().unwrap_or("").to_owned();
    let mut hits: Vec<String> = Vec::new();
    for line in lines {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if let Some(id) = parse_log_line(line) {
            hits.push(id);
        }
    }

    {
        let mut guard = state.lock().expect("logs state poisoned");
        if let Some(active) = guard.active_log.as_mut() {
            // Only persist if the file we just read is still the active one
            // (a folder-watcher event could have swapped it underneath us).
            if active.path == path {
                active.offset = offset;
                active.partial = leftover;
            }
        }
    }

    for id in hits {
        emit_map_change(app, state, id);
    }
}

/// Switch the tail to a new `log_*` session folder (and its highest
/// application_NNN.log if one already exists). `seed_from_existing` is true
/// only on startup — when we discover a brand-new folder mid-session, the
/// folder is empty and we just wait for the tail to pick up new lines.
fn attach_to_session(
    app: &AppHandle,
    state: &Mutex<State>,
    folder: PathBuf,
    seed_from_existing: bool,
) {
    let picked = pick_latest_application_log(&folder);

    let seed_id = if seed_from_existing {
        picked
            .as_ref()
            .and_then(|(path, _)| find_latest_map_id_in_file(path))
    } else {
        None
    };

    {
        let mut guard = state.lock().expect("logs state poisoned");
        guard.active_folder = Some(folder);
        guard.active_log = picked.map(|(path, suffix)| {
            let offset = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            ActiveLog {
                path,
                suffix,
                offset,
                partial: String::new(),
            }
        });
    }

    if let Some(id) = seed_id {
        emit_map_change(app, state, id);
    }
}

/// Check the active folder for a higher-suffix application_NNN.log file and
/// switch to it if present. Cheap — a single read_dir per poll tick.
fn check_within_session_rotation(state: &Mutex<State>) {
    let snapshot = {
        let guard = state.lock().expect("logs state poisoned");
        guard.active_folder.clone().map(|folder| {
            let current_suffix = guard.active_log.as_ref().map(|a| a.suffix);
            (folder, current_suffix)
        })
    };
    let Some((folder, current_suffix)) = snapshot else { return };
    let Some((new_path, new_suffix)) = pick_latest_application_log(&folder) else { return };
    if current_suffix.is_some_and(|s| new_suffix <= s) {
        return;
    }
    // Promote to the newer file. Start at its current EOF so we don't replay
    // historical bytes from a freshly-rotated _001 file (its content is
    // either empty or a continuation).
    let mut guard = state.lock().expect("logs state poisoned");
    if guard
        .active_log
        .as_ref()
        .is_some_and(|a| a.path == new_path)
    {
        return;
    }
    let offset = fs::metadata(&new_path).map(|m| m.len()).unwrap_or(0);
    guard.active_log = Some(ActiveLog {
        path: new_path,
        suffix: new_suffix,
        offset,
        partial: String::new(),
    });
}

/// Check the logs dir for a session folder newer than the active one. The
/// notify debouncer fires on folder creation, but the actual lookup happens
/// here so we don't have to thread name-comparison logic through the event
/// channel.
fn check_new_session_folder(app: &AppHandle, state: &Mutex<State>, logs_dir: &Path) {
    let folders = list_session_folders(logs_dir);
    let Some(latest) = folders.last().cloned() else { return };
    let current = {
        let guard = state.lock().expect("logs state poisoned");
        guard.active_folder.clone()
    };
    let is_newer = match &current {
        Some(c) => latest > *c,
        None => true,
    };
    if !is_newer {
        return;
    }
    eprintln!(
        "[logs-watcher] new tarkov log session detected: {}",
        latest.display()
    );
    // seed_from_existing=false: a fresh folder is empty; the tail will pick
    // up the next session's first map-load line live.
    attach_to_session(app, state, latest, false);
}

pub struct LogsWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
    stop_flag: Arc<AtomicBool>,
}

impl Drop for LogsWatcher {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
    }
}

/// Start watching `logs_dir`. Lifecycle mirrors the Node port in
/// `apps/server/src/watchers/logs.ts` — see its doc-comment for the full
/// behaviour spec.
pub fn start(logs_dir: PathBuf, app: AppHandle) -> Result<LogsWatcher> {
    let state = Arc::new(Mutex::new(State {
        last_emitted_map_id: None,
        active_folder: None,
        active_log: None,
    }));

    // Initial seed from latest existing session, if any.
    if let Some(latest) = list_session_folders(&logs_dir).last().cloned() {
        attach_to_session(&app, &state, latest, true);
    } else {
        eprintln!(
            "[logs-watcher] no existing tarkov log sessions yet at {}",
            logs_dir.display()
        );
    }

    // Folder watcher — wakes up the poll thread quickly on new session
    // creation. The poll thread also checks periodically, so this is purely
    // a latency optimisation, not a correctness requirement.
    let (tx, rx) = mpsc::channel::<notify_debouncer_full::DebounceEventResult>();
    let mut debouncer = new_debouncer(Duration::from_millis(250), None, tx)
        .context("create fs debouncer for logs dir")?;
    debouncer
        .watcher()
        .watch(&logs_dir, RecursiveMode::NonRecursive)
        .with_context(|| format!("watch {}", logs_dir.display()))?;
    debouncer
        .cache()
        .add_root(&logs_dir, RecursiveMode::NonRecursive);

    let stop_flag = Arc::new(AtomicBool::new(false));

    // Folder event drain thread — its only job is to wake the poll thread
    // and let it observe the new folder. The actual switching logic lives
    // in the poll thread to keep state ownership single-threaded.
    let stop_for_folders = Arc::clone(&stop_flag);
    let app_for_folders = app.clone();
    let state_for_folders = Arc::clone(&state);
    let logs_dir_for_folders = logs_dir.clone();
    std::thread::Builder::new()
        .name("logs-folder-watcher".into())
        .spawn(move || {
            for _batch in rx {
                if stop_for_folders.load(Ordering::SeqCst) {
                    break;
                }
                check_new_session_folder(&app_for_folders, &state_for_folders, &logs_dir_for_folders);
            }
        })
        .context("spawn logs folder watcher thread")?;

    // Tail poll thread — 300 ms cadence matches the Node port's chokidar
    // polling interval. Also performs cheap within-session rotation
    // checks each tick (handles `_000` → `_001` rollover).
    let stop_for_tail = Arc::clone(&stop_flag);
    let app_for_tail = app.clone();
    let state_for_tail = Arc::clone(&state);
    std::thread::Builder::new()
        .name("logs-tail-watcher".into())
        .spawn(move || {
            while !stop_for_tail.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(300));
                check_within_session_rotation(&state_for_tail);
                read_appended(&app_for_tail, &state_for_tail);
            }
        })
        .context("spawn logs tail watcher thread")?;

    eprintln!("[logs-watcher] started on {}", logs_dir.display());

    Ok(LogsWatcher {
        _debouncer: debouncer,
        stop_flag,
    })
}
