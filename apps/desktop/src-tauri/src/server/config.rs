//! User-overrides store for Tarkov directory paths.
//!
//! Persisted in `%APPDATA%/tarkov-checker/config.json`. JSON shape:
//! `{ gameDir?, screenshotsDir? }`, both nullable. UNC paths are
//! rejected at the validation layer (see `normalize`) — they cannot be
//! watched reliably and would be a privacy-leak surface if accepted.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::sync::Mutex;

use super::paths::ManualOverrides;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screenshots_dir: Option<String>,
    /// LAN-phone unlock. When `true`, the HTTP server binds `0.0.0.0`
    /// instead of `127.0.0.1` AND applies bearer-token auth to the
    /// state-changing routes. Default `false` — loopback-only, no auth.
    ///
    /// Toggled via the tray menu, applied on restart (not live-rebind).
    /// See PLAN-LAN-AND-TRAY.md "Restart-on-config-change".
    #[serde(default)]
    pub lan_mode: bool,
}

/// PUT body. Each field is optional; only the keys present are updated.
/// `Some(None)` clears the override; `Some(Some(s))` sets it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_dir: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screenshots_dir: Option<Option<String>>,
}

pub struct ConfigStore {
    file: PathBuf,
    state: Mutex<StoredConfig>,
}

impl ConfigStore {
    pub async fn load(file: PathBuf) -> Result<Self> {
        let state = match tokio::fs::read_to_string(&file).await {
            Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => StoredConfig::default(),
            Err(e) => {
                return Err(e).context(format!("read {}", file.display()));
            }
        };
        Ok(Self {
            file,
            state: Mutex::new(state),
        })
    }

    pub async fn overrides(&self) -> ManualOverrides {
        let s = self.state.lock().await;
        ManualOverrides {
            game_dir: s.game_dir.clone(),
            screenshots_dir: s.screenshots_dir.clone(),
        }
    }

    /// Snapshot of the current LAN-mode flag. Cheap (one Mutex lock,
    /// one bool read) — caller can poll it freely.
    pub async fn is_lan_mode(&self) -> bool {
        self.state.lock().await.lan_mode
    }

    /// Persist a new LAN-mode value. The HTTP server does NOT pick this
    /// up until the next process start — see PLAN-LAN-AND-TRAY.md
    /// "Restart-on-config-change" for the reasoning.
    #[allow(dead_code)] // wired in when the tray "Enable LAN mode" lands (E5)
    pub async fn set_lan_mode(&self, value: bool) -> Result<()> {
        {
            let mut s = self.state.lock().await;
            s.lan_mode = value;
        }
        self.persist().await
    }

    pub async fn apply(&self, patch: ConfigPatch) -> Result<()> {
        // Validate all fields before acquiring the lock so a rejected UNC path
        // never partially mutates state (e.g. game_dir updated but
        // screenshots_dir rejected would otherwise leave an in-memory orphan).
        let game_dir = match patch.game_dir {
            Some(v) => Some(normalize(v).map_err(|e| anyhow::anyhow!(e))?),
            None => None,
        };
        let screenshots_dir = match patch.screenshots_dir {
            Some(v) => Some(normalize(v).map_err(|e| anyhow::anyhow!(e))?),
            None => None,
        };

        {
            let mut s = self.state.lock().await;
            if let Some(v) = game_dir {
                s.game_dir = v;
            }
            if let Some(v) = screenshots_dir {
                s.screenshots_dir = v;
            }
        }
        self.persist().await
    }

    async fn persist(&self) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            tokio::fs::create_dir_all(dir)
                .await
                .with_context(|| format!("mkdir {}", dir.display()))?;
        }
        let s = self.state.lock().await;
        let body = serde_json::to_string_pretty(&*s).context("serialize config")?;
        tokio::fs::write(&self.file, body)
            .await
            .with_context(|| format!("write {}", self.file.display()))?;
        Ok(())
    }
}

/// Trim whitespace, reject UNC paths (`\\server\share` / `//server/share`),
/// and return `None` for empty strings. Mirrors the TS `normalize()` in
/// `config-store.ts` which added UNC rejection to prevent the watcher from
/// navigating to an SMB share.
fn normalize(v: Option<String>) -> Result<Option<String>, String> {
    match v {
        None => Ok(None),
        Some(s) => {
            let t = s.trim();
            if t.is_empty() {
                return Ok(None);
            }
            if t.starts_with("\\\\") || t.starts_with("//") {
                return Err(format!("UNC paths are not supported: {t}"));
            }
            Ok(Some(t.to_string()))
        }
    }
}

pub fn data_dir() -> Result<PathBuf> {
    let appdata = std::env::var("APPDATA").context("APPDATA env var unset")?;
    let dir = Path::new(&appdata).join("tarkov-checker");
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- normalize -----------------------------------------------------------

    #[test]
    fn normalize_none_returns_ok_none() {
        assert_eq!(normalize(None), Ok(None));
    }

    #[test]
    fn normalize_empty_string_returns_ok_none() {
        assert_eq!(normalize(Some(String::new())), Ok(None));
    }

    #[test]
    fn normalize_whitespace_only_returns_ok_none() {
        assert_eq!(normalize(Some("   ".to_string())), Ok(None));
    }

    #[test]
    fn normalize_plain_path_preserved() {
        assert_eq!(
            normalize(Some(r"D:\Tarkov".to_string())),
            Ok(Some(r"D:\Tarkov".to_string()))
        );
    }

    #[test]
    fn normalize_trims_surrounding_whitespace() {
        assert_eq!(
            normalize(Some(r"  D:\Tarkov  ".to_string())),
            Ok(Some(r"D:\Tarkov".to_string()))
        );
    }

    #[test]
    fn normalize_unc_backslash_rejected() {
        let result = normalize(Some(r"\\server\share".to_string()));
        assert!(
            result.is_err(),
            "UNC backslash path should be rejected, got {result:?}"
        );
    }

    #[test]
    fn normalize_unc_forward_slash_rejected() {
        let result = normalize(Some("//server/share".to_string()));
        assert!(
            result.is_err(),
            "UNC forward-slash path should be rejected, got {result:?}"
        );
    }
}
