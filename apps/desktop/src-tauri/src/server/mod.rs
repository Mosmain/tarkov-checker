//! In-process port of the Node/Fastify server.
//!
//! Lives inside the Tauri Rust process and exposes the same data the
//! browser/LAN clients used to consume via SSE + HTTP — but through
//! Tauri events (`position`) and commands (`get_config`, `update_config`).
//!
//! Layout mirrors the original TS modules so cross-checking against
//! `apps/server/src/` stays straightforward.

pub mod config;
pub mod logs;
pub mod paths;
pub mod screenshots;
