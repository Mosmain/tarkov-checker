//! Port of `apps/server/src/config-store.ts` + the `serverConfigUpdateSchema`.
//!
//! Persisted in `%APPDATA%/tarkov-checker/config.json`. The shape stays
//! compatible with the existing JSON file: `{ gameDir?, screenshotsDir? }`,
//! both nullable.

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

    pub async fn apply(&self, patch: ConfigPatch) -> Result<()> {
        {
            let mut s = self.state.lock().await;
            if let Some(v) = patch.game_dir {
                s.game_dir = normalize(v);
            }
            if let Some(v) = patch.screenshots_dir {
                s.screenshots_dir = normalize(v);
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

fn normalize(v: Option<String>) -> Option<String> {
    v.and_then(|s| {
        let t = s.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    })
}

pub fn data_dir() -> Result<PathBuf> {
    let appdata = std::env::var("APPDATA").context("APPDATA env var unset")?;
    let dir = Path::new(&appdata).join("tarkov-checker");
    Ok(dir)
}
