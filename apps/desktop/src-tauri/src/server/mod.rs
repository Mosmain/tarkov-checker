//! In-process backend: filesystem watchers, path resolver, config store,
//! and the broadcast channel that ties the two transport paths together.
//!
//! Surfaces data through two parallel channels:
//!   * Tauri events (`position`, `map-change`) consumed by the webview
//!     via `@tauri-apps/api/event::listen`.
//!   * The local HTTP server (`crate::http_server`) for browser clients
//!     on `127.0.0.1:47474`.
//!
//! Modules are split by concern, not by transport — each watcher emits
//! into both channels via the broadcast Sender held by `WatcherSlot`.

pub mod config;
pub mod events;
pub mod logs;
pub mod parse_log_regexes;
pub mod parse_screenshot_regexes;
pub mod paths;
pub mod screenshots;
