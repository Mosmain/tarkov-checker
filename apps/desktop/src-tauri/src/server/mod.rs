//! In-process port of the Node/Fastify server.
//!
//! Lives inside the Tauri Rust process and exposes the same data the
//! browser/LAN clients used to consume via WS + HTTP — but through
//! Tauri events (`position`, `heartbeat`, ...) and commands
//! (`get_config`, `update_config`, `get_extracts`).
//!
//! Layout mirrors the original TS modules so cross-checking against
//! `apps/server/src/` stays straightforward.

pub mod config;
pub mod extracts;
pub mod paths;
pub mod screenshots;
