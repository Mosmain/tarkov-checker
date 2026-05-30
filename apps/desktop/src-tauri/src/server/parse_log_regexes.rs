// AUTO-GENERATED FILE — DO NOT EDIT
// Source: packages/shared/src/parse-log.ts
// Regenerate: pnpm shared:gen-rust-regex
//
// Regex patterns for Tarkov log line parsing.
// The (?i) prefix is the inline Rust equivalent of the /i flag in the TS source.
// Consumed by logs.rs via `Regex::new(parse_log_regexes::NAME)`.

#[rustfmt::skip]
pub const SCENE_PRESET_RE: &str = r#"(?i)\brcid:([A-Za-z0-9_]+)\.scenespreset\.asset\b"#;
#[rustfmt::skip]
pub const TRANSIT_LOCATION_RE: &str = r#"(?i)\[Transit\].*\bLocations:([A-Za-z0-9_]+)"#;
#[rustfmt::skip]
pub const TRACE_LOCATION_RE: &str = r#"(?i)\bLocation:\s+([A-Za-z0-9_]+)\s*,\s*Sid:"#;
