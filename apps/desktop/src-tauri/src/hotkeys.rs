//! OS-global hotkey registration, owned by the backend.
//!
//! Two implementations behind one [`HotkeyController`] trait — they are never
//! used together (the windowed app and the headless backend are mutually
//! exclusive; both bind :47474):
//!
//! * [`TauriHotkeys`] — used by `run()`. Delegates to the already-initialised
//!   `tauri-plugin-global-shortcut` (its manager lives on Tauri's main thread,
//!   which pumps Win32 messages). The five action combos are registered via
//!   the plugin's `GlobalShortcut` API; a process-global handler installed in
//!   `lib.rs` reads the id→action map this controller maintains and fans the
//!   press out as a `command` event. The overlay lock combo stays separate
//!   (client-registered via the plugin's JS API) and is absent from the map.
//! * [`StandaloneHotkeys`] — used by `run_headless()`. There is no Tauri event
//!   loop, so it owns a dedicated OS thread that creates a
//!   `global_hotkey::GlobalHotKeyManager` and runs its own `PeekMessage` pump,
//!   reading `WM_HOTKEY` directly (no process-global handler involved).
//!
//! Combos are accelerator strings parsed by `global_hotkey::hotkey::HotKey`,
//! whose `id()` is deterministic (`(mods<<16)|key`) — so the registered id can
//! be mapped back to the action that produced it.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use global_hotkey::hotkey::HotKey;
use global_hotkey::GlobalHotKeyManager;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tokio::sync::broadcast;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_HOTKEY,
};

use crate::server::events::{HotkeyAction, ServerEvent};
use crate::server::hotkeys::HotkeyConfig;

/// Reconcile registered OS hotkeys with a config, and bracket the recorder's
/// capture window (suspend = drop all binds so the keystroke reaches the UI,
/// resume = re-claim from the current config). All methods are synchronous and
/// may block (the Tauri impl round-trips to the main thread; the standalone
/// impl round-trips to its pump thread) — call from `spawn_blocking`.
pub trait HotkeyController: Send + Sync {
    /// Register `desired`, reverting any field whose combo can't be claimed.
    /// Returns the effective config (what is actually registered now).
    fn apply(&self, desired: &HotkeyConfig) -> HotkeyConfig;
    /// Drop all five OS binds (recorder is capturing).
    fn suspend(&self);
    /// Re-claim all five from the current config (recorder finished).
    fn resume(&self);
}

/// The five (action, combo) pairs of a config, in stable order.
fn config_entries(cfg: &HotkeyConfig) -> [(HotkeyAction, &str); 5] {
    [
        (HotkeyAction::ZoomIn, cfg.zoom_in.as_str()),
        (HotkeyAction::ZoomOut, cfg.zoom_out.as_str()),
        (HotkeyAction::FloorUp, cfg.floor_up.as_str()),
        (HotkeyAction::FloorDown, cfg.floor_down.as_str()),
        (HotkeyAction::Airdrop, cfg.airdrop.as_str()),
    ]
}

/// (action, old, new) triples for diffing `current` against `desired`.
fn config_diff(
    current: &HotkeyConfig,
    desired: &HotkeyConfig,
) -> [(HotkeyAction, String, String); 5] {
    [
        (
            HotkeyAction::ZoomIn,
            current.zoom_in.clone(),
            desired.zoom_in.clone(),
        ),
        (
            HotkeyAction::ZoomOut,
            current.zoom_out.clone(),
            desired.zoom_out.clone(),
        ),
        (
            HotkeyAction::FloorUp,
            current.floor_up.clone(),
            desired.floor_up.clone(),
        ),
        (
            HotkeyAction::FloorDown,
            current.floor_down.clone(),
            desired.floor_down.clone(),
        ),
        (
            HotkeyAction::Airdrop,
            current.airdrop.clone(),
            desired.airdrop.clone(),
        ),
    ]
}

fn config_from_pairs(pairs: &[(HotkeyAction, String)]) -> HotkeyConfig {
    let mut cfg = HotkeyConfig::default();
    for (action, combo) in pairs {
        match action {
            HotkeyAction::ZoomIn => cfg.zoom_in = combo.clone(),
            HotkeyAction::ZoomOut => cfg.zoom_out = combo.clone(),
            HotkeyAction::FloorUp => cfg.floor_up = combo.clone(),
            HotkeyAction::FloorDown => cfg.floor_down = combo.clone(),
            HotkeyAction::Airdrop => cfg.airdrop = combo.clone(),
        }
    }
    cfg
}

/// Build the id→action lookup for a config (combos that fail to parse are
/// skipped — they were validated by the store, so this only drops garbage).
pub fn action_map(cfg: &HotkeyConfig) -> HashMap<u32, HotkeyAction> {
    let mut map = HashMap::new();
    for (action, combo) in config_entries(cfg) {
        if let Ok(hk) = HotKey::from_str(combo) {
            map.insert(hk.id(), action);
        }
    }
    map
}

/// The five combos as accelerator strings, for the plugin Builder.
pub fn config_combos(cfg: &HotkeyConfig) -> Vec<String> {
    config_entries(cfg)
        .iter()
        .map(|(_, c)| c.to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// Tauri (windowed app) — delegates to tauri-plugin-global-shortcut.
// ---------------------------------------------------------------------------

pub struct TauriHotkeys {
    app: AppHandle,
    /// Shared with the process-global plugin handler installed in `lib.rs`;
    /// the handler reads it to turn a pressed shortcut id into an action.
    map: std::sync::Arc<Mutex<HashMap<u32, HotkeyAction>>>,
    current: Mutex<HotkeyConfig>,
}

impl TauriHotkeys {
    /// `map` must already be seeded with `initial`'s ids (the plugin Builder
    /// registered those combos before the app started — see `lib.rs`).
    pub fn new(
        app: AppHandle,
        map: std::sync::Arc<Mutex<HashMap<u32, HotkeyAction>>>,
        initial: HotkeyConfig,
    ) -> Self {
        Self {
            app,
            map,
            current: Mutex::new(initial),
        }
    }
}

impl HotkeyController for TauriHotkeys {
    fn apply(&self, desired: &HotkeyConfig) -> HotkeyConfig {
        let gs = self.app.global_shortcut();
        let mut map = self.map.lock().expect("hotkey map poisoned");
        let mut current = self.current.lock().expect("hotkey current poisoned");

        let mut eff: Vec<(HotkeyAction, String)> = Vec::with_capacity(5);
        for (action, old, new) in config_diff(&current, desired) {
            if old == new {
                eff.push((action, new));
                continue;
            }
            let _ = gs.unregister(old.as_str());
            if let Ok(hk) = HotKey::from_str(&old) {
                map.remove(&hk.id());
            }
            match gs.register(new.as_str()) {
                Ok(()) => {
                    if let Ok(hk) = HotKey::from_str(&new) {
                        map.insert(hk.id(), action);
                    }
                    eff.push((action, new));
                }
                Err(e) => {
                    eprintln!("[hotkeys] register '{new}' failed: {e}; keeping '{old}'");
                    let _ = gs.register(old.as_str());
                    if let Ok(hk) = HotKey::from_str(&old) {
                        map.insert(hk.id(), action);
                    }
                    eff.push((action, old));
                }
            }
        }
        let result = config_from_pairs(&eff);
        *current = result.clone();
        result
    }

    fn suspend(&self) {
        let gs = self.app.global_shortcut();
        let mut map = self.map.lock().expect("hotkey map poisoned");
        let current = self.current.lock().expect("hotkey current poisoned");
        for (_, combo) in config_entries(&current) {
            let _ = gs.unregister(combo);
        }
        map.clear();
    }

    fn resume(&self) {
        let gs = self.app.global_shortcut();
        let mut map = self.map.lock().expect("hotkey map poisoned");
        let current = self.current.lock().expect("hotkey current poisoned");
        map.clear();
        for (action, combo) in config_entries(&current) {
            match gs.register(combo) {
                Ok(()) => {
                    if let Ok(hk) = HotKey::from_str(combo) {
                        map.insert(hk.id(), action);
                    }
                }
                Err(e) => eprintln!("[hotkeys] resume register '{combo}' failed: {e}"),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Standalone (headless backend) — own thread + Win32 message pump.
// ---------------------------------------------------------------------------

enum ReqKind {
    Apply(HotkeyConfig),
    Suspend,
    Resume,
}

struct HotkeyRequest {
    kind: ReqKind,
    reply: mpsc::Sender<HotkeyConfig>,
}

pub struct StandaloneHotkeys {
    req_tx: mpsc::Sender<HotkeyRequest>,
}

impl StandaloneHotkeys {
    pub fn spawn(event_tx: broadcast::Sender<ServerEvent>, initial: HotkeyConfig) -> Self {
        let (req_tx, req_rx) = mpsc::channel::<HotkeyRequest>();
        std::thread::Builder::new()
            .name("global-hotkeys".into())
            .spawn(move || pump_thread(event_tx, initial, req_rx))
            .expect("spawn global-hotkeys thread");
        Self { req_tx }
    }

    fn request(&self, kind: ReqKind, fallback: HotkeyConfig) -> HotkeyConfig {
        let (reply_tx, reply_rx) = mpsc::channel();
        if self
            .req_tx
            .send(HotkeyRequest {
                kind,
                reply: reply_tx,
            })
            .is_err()
        {
            return fallback; // pump thread gone
        }
        reply_rx
            .recv_timeout(Duration::from_secs(2))
            .unwrap_or(fallback)
    }
}

impl HotkeyController for StandaloneHotkeys {
    fn apply(&self, desired: &HotkeyConfig) -> HotkeyConfig {
        self.request(ReqKind::Apply(desired.clone()), desired.clone())
    }
    fn suspend(&self) {
        let _ = self.request(ReqKind::Suspend, HotkeyConfig::default());
    }
    fn resume(&self) {
        let _ = self.request(ReqKind::Resume, HotkeyConfig::default());
    }
}

fn register_all(
    manager: &GlobalHotKeyManager,
    cfg: &HotkeyConfig,
    registered: &mut HashMap<u32, HotkeyAction>,
) {
    for (action, combo) in config_entries(cfg) {
        if let Ok(hk) = HotKey::from_str(combo) {
            match manager.register(hk) {
                Ok(()) => {
                    registered.insert(hk.id(), action);
                }
                Err(e) => eprintln!("[hotkeys] register '{combo}' failed: {e}"),
            }
        }
    }
}

fn unregister_cfg(
    manager: &GlobalHotKeyManager,
    cfg: &HotkeyConfig,
    registered: &mut HashMap<u32, HotkeyAction>,
) {
    for (_, combo) in config_entries(cfg) {
        if let Ok(hk) = HotKey::from_str(combo) {
            let _ = manager.unregister(hk);
            registered.remove(&hk.id());
        }
    }
}

fn reconcile(
    manager: &GlobalHotKeyManager,
    current: &HotkeyConfig,
    desired: &HotkeyConfig,
    registered: &mut HashMap<u32, HotkeyAction>,
) -> HotkeyConfig {
    let mut eff: Vec<(HotkeyAction, String)> = Vec::with_capacity(5);
    for (action, old, new) in config_diff(current, desired) {
        if old == new {
            eff.push((action, new));
            continue;
        }
        if let Ok(hk) = HotKey::from_str(&old) {
            let _ = manager.unregister(hk);
            registered.remove(&hk.id());
        }
        let registered_new = HotKey::from_str(&new)
            .ok()
            .and_then(|hk| manager.register(hk).ok().map(|()| hk));
        match registered_new {
            Some(hk) => {
                registered.insert(hk.id(), action);
                eff.push((action, new));
            }
            None => {
                eprintln!("[hotkeys] register '{new}' failed; keeping '{old}'");
                if let Ok(hk) = HotKey::from_str(&old) {
                    if manager.register(hk).is_ok() {
                        registered.insert(hk.id(), action);
                    }
                }
                eff.push((action, old));
            }
        }
    }
    config_from_pairs(&eff)
}

fn pump_thread(
    event_tx: broadcast::Sender<ServerEvent>,
    initial: HotkeyConfig,
    req_rx: mpsc::Receiver<HotkeyRequest>,
) {
    let manager = match GlobalHotKeyManager::new() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[hotkeys] GlobalHotKeyManager::new failed: {e}");
            return;
        }
    };

    let mut current = initial;
    let mut suspended = false;
    let mut registered: HashMap<u32, HotkeyAction> = HashMap::new();
    register_all(&manager, &current, &mut registered);
    eprintln!(
        "[hotkeys] headless global hotkeys registered ({} combos)",
        registered.len()
    );

    let mut msg: MSG = unsafe { std::mem::zeroed() };
    loop {
        // Drain Win32 messages so WM_HOTKEY is observed. We read the hotkey id
        // straight off the message (wParam == HotKey::id()) instead of routing
        // through the crate's process-global handler.
        unsafe {
            while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if msg.message == WM_HOTKEY {
                    let id = msg.wParam as u32;
                    if let Some(&action) = registered.get(&id) {
                        let _ = event_tx.send(ServerEvent::Command { action });
                    }
                } else {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        }

        match req_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(req) => {
                match req.kind {
                    ReqKind::Apply(desired) => {
                        if suspended {
                            current = desired;
                        } else {
                            current = reconcile(&manager, &current, &desired, &mut registered);
                        }
                    }
                    ReqKind::Suspend => {
                        unregister_cfg(&manager, &current, &mut registered);
                        suspended = true;
                    }
                    ReqKind::Resume => {
                        suspended = false;
                        registered.clear();
                        register_all(&manager, &current, &mut registered);
                    }
                }
                let _ = req.reply.send(current.clone());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}
