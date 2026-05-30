//! Server-emitted event types and the broadcast channel that fan-outs
//! them. The same enum is consumed by:
//!
//! * The Tauri webview path — already gets events via `app.emit("position",
//!   …)` / `app.emit("map-change", …)`, untouched.
//! * The browser-frontend path — subscribes to `GET /events` (SSE), which
//!   plumbs each broadcast item into a `data: …` frame.
//!
//! `tokio::sync::broadcast` is fan-out by design: one `Sender`, N
//! `Receiver`s. A new SSE connection calls `sender.subscribe()` to get a
//! fresh receiver; on disconnect the receiver is dropped and the broadcast
//! buffer for that slot reclaims itself.
//!
//! Capacity = 64 — plenty for our throughput (~1 position event per
//! screenshot, ~1 map-change per raid load). Slow consumers see
//! `RecvError::Lagged` instead of blocking the producer.

use serde::Serialize;
use tokio::sync::broadcast;

/// Wire-shape that goes onto the SSE stream. Tagged enum: the `type`
/// field tells the client which variant arrived. Field names match the
/// existing `position` / `map-change` Tauri-event payloads so the
/// browser-side dispatcher can stay structurally identical to the
/// webview's `listen()`-based one.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ServerEvent {
    Position {
        t: i64,
        x: f64,
        y: f64,
        z: f64,
        yaw: Option<f64>,
    },
    MapChange {
        t: i64,
        #[serde(rename = "rawMapId")]
        raw_map_id: String,
    },
}

/// Capacity for the broadcast buffer. A position event is ~64 bytes
/// serialised; 64 slots = ~4 KB per channel — trivial.
pub const CHANNEL_CAPACITY: usize = 64;

/// Construct a fresh `(Sender, Receiver)` pair. The Sender is shared
/// across the watcher modules (clones produced via `Sender::clone`); the
/// initial Receiver is dropped immediately because we want subscribers
/// to start with an empty queue, not a backlog of pre-startup events.
pub fn channel() -> broadcast::Sender<ServerEvent> {
    let (tx, _rx) = broadcast::channel(CHANNEL_CAPACITY);
    tx
}
