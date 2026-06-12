//! Backend-owned store for the global hotkey combos.
//!
//! Persisted in `%APPDATA%/raidmate/hotkeys.json` — a sibling to
//! `config.json` so the `/api/config` (paths) contract stays clean. Holds
//! the five forwarded actions only; the overlay lock combo lives client-side
//! (see CLAUDE.md "Desktop overlay" / the hotkey rework plan).
//!
//! Each combo is an accelerator string (`CommandOrControl+Alt+D`, …) parseable
//! by `global_hotkey::hotkey::HotKey::from_str` — the same format the client
//! recorder emits. `apply` validates every supplied string before mutating
//! state so a single bad combo can't half-update the file.

use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{Context, Result};
use global_hotkey::hotkey::HotKey;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

/// Defaults match the client's `DEFAULTS` so an un-customised install
/// agrees on both ends.
const DEFAULT_ZOOM_IN: &str = "CommandOrControl+=";
const DEFAULT_ZOOM_OUT: &str = "CommandOrControl+-";
const DEFAULT_FLOOR_UP: &str = "CommandOrControl+Shift+=";
const DEFAULT_FLOOR_DOWN: &str = "CommandOrControl+Shift+-";
const DEFAULT_AIRDROP: &str = "CommandOrControl+Alt+D";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub zoom_in: String,
    pub zoom_out: String,
    pub floor_up: String,
    pub floor_down: String,
    pub airdrop: String,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            zoom_in: DEFAULT_ZOOM_IN.to_string(),
            zoom_out: DEFAULT_ZOOM_OUT.to_string(),
            floor_up: DEFAULT_FLOOR_UP.to_string(),
            floor_down: DEFAULT_FLOOR_DOWN.to_string(),
            airdrop: DEFAULT_AIRDROP.to_string(),
        }
    }
}

/// PUT body. Each field optional; only present keys are updated.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyPatch {
    #[serde(default)]
    pub zoom_in: Option<String>,
    #[serde(default)]
    pub zoom_out: Option<String>,
    #[serde(default)]
    pub floor_up: Option<String>,
    #[serde(default)]
    pub floor_down: Option<String>,
    #[serde(default)]
    pub airdrop: Option<String>,
}

/// Validate an accelerator string by round-tripping it through the same
/// parser the registration layer uses. Returns the trimmed string on success.
fn validate(combo: &str) -> Result<String, String> {
    let t = combo.trim();
    HotKey::from_str(t)
        .map(|_| t.to_string())
        .map_err(|e| format!("invalid hotkey \"{t}\": {e}"))
}

pub struct HotkeyStore {
    file: PathBuf,
    state: Mutex<HotkeyConfig>,
}

impl HotkeyStore {
    pub async fn load(file: PathBuf) -> Result<Self> {
        let state = match tokio::fs::read_to_string(&file).await {
            Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => HotkeyConfig::default(),
            Err(e) => return Err(e).context(format!("read {}", file.display())),
        };
        Ok(Self {
            file,
            state: Mutex::new(state),
        })
    }

    pub async fn get(&self) -> HotkeyConfig {
        self.state.lock().await.clone()
    }

    /// Apply a patch: validate every supplied combo first, then merge and
    /// persist. Returns the merged config. Rejects (without mutating) on the
    /// first unparseable combo.
    pub async fn apply(&self, patch: HotkeyPatch) -> Result<HotkeyConfig, String> {
        let zoom_in = patch.zoom_in.map(|s| validate(&s)).transpose()?;
        let zoom_out = patch.zoom_out.map(|s| validate(&s)).transpose()?;
        let floor_up = patch.floor_up.map(|s| validate(&s)).transpose()?;
        let floor_down = patch.floor_down.map(|s| validate(&s)).transpose()?;
        let airdrop = patch.airdrop.map(|s| validate(&s)).transpose()?;

        let merged = {
            let mut s = self.state.lock().await;
            if let Some(v) = zoom_in {
                s.zoom_in = v;
            }
            if let Some(v) = zoom_out {
                s.zoom_out = v;
            }
            if let Some(v) = floor_up {
                s.floor_up = v;
            }
            if let Some(v) = floor_down {
                s.floor_down = v;
            }
            if let Some(v) = airdrop {
                s.airdrop = v;
            }
            s.clone()
        };

        self.persist(&merged).await.map_err(|e| e.to_string())?;
        Ok(merged)
    }

    /// Overwrite stored state with a fully-resolved config (used after the
    /// manager reverts a field that failed to register). Persists.
    pub async fn set(&self, config: HotkeyConfig) -> Result<()> {
        {
            let mut s = self.state.lock().await;
            *s = config.clone();
        }
        self.persist(&config).await
    }

    async fn persist(&self, config: &HotkeyConfig) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            tokio::fs::create_dir_all(dir)
                .await
                .with_context(|| format!("mkdir {}", dir.display()))?;
        }
        let body = serde_json::to_string_pretty(config).context("serialize hotkeys")?;
        tokio::fs::write(&self.file, body)
            .await
            .with_context(|| format!("write {}", self.file.display()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_file() -> PathBuf {
        std::env::temp_dir().join(format!(
            "raidmate-hotkeys-test-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
        ))
    }

    #[test]
    fn defaults_all_parse_as_hotkeys() {
        let cfg = HotkeyConfig::default();
        for combo in [
            &cfg.zoom_in,
            &cfg.zoom_out,
            &cfg.floor_up,
            &cfg.floor_down,
            &cfg.airdrop,
        ] {
            assert!(
                HotKey::from_str(combo).is_ok(),
                "default combo should parse: {combo}"
            );
        }
    }

    #[tokio::test]
    async fn load_missing_file_yields_defaults() {
        let store = HotkeyStore::load(tmp_file()).await.unwrap();
        assert_eq!(store.get().await, HotkeyConfig::default());
    }

    #[tokio::test]
    async fn apply_patches_only_supplied_fields_and_persists() {
        let file = tmp_file();
        let store = HotkeyStore::load(file.clone()).await.unwrap();
        let merged = store
            .apply(HotkeyPatch {
                zoom_in: Some("CommandOrControl+Alt+Z".to_string()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(merged.zoom_in, "CommandOrControl+Alt+Z");
        assert_eq!(merged.airdrop, HotkeyConfig::default().airdrop);

        // Reload from disk — the change must have persisted.
        let reloaded = HotkeyStore::load(file).await.unwrap();
        assert_eq!(reloaded.get().await.zoom_in, "CommandOrControl+Alt+Z");
    }

    #[tokio::test]
    async fn apply_rejects_unparseable_combo_without_mutating() {
        let store = HotkeyStore::load(tmp_file()).await.unwrap();
        let result = store
            .apply(HotkeyPatch {
                zoom_in: Some("totally+nonsense+key".to_string()),
                ..Default::default()
            })
            .await;
        assert!(result.is_err(), "bad combo should be rejected");
        // State untouched.
        assert_eq!(store.get().await, HotkeyConfig::default());
    }

    #[tokio::test]
    async fn apply_trims_whitespace() {
        let store = HotkeyStore::load(tmp_file()).await.unwrap();
        let merged = store
            .apply(HotkeyPatch {
                airdrop: Some("  CommandOrControl+Alt+D  ".to_string()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(merged.airdrop, "CommandOrControl+Alt+D");
    }
}
