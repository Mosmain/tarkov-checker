//! Port of `apps/server/src/extracts-cache.ts`.
//!
//! tarkov.dev GraphQL fetch + on-disk per-language cache. The cache file
//! lives next to `config.json` in `%APPDATA%/tarkov-checker/`. Concurrent
//! `get_or_fetch` calls share one inflight request via the outer Mutex —
//! the network round-trip is short and only one user is connected, so
//! per-lang locking would be overengineering.

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const TARKOV_DEV_URL: &str = "https://api.tarkov.dev/graphql";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position3d {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Extract {
    pub name: String,
    /// `"pmc" | "scav" | "shared" | null` — the API may return null when
    /// the extract is faction-neutral but not yet tagged as "shared".
    pub faction: Option<String>,
    pub position: Position3d,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapExtracts {
    pub name_id: String,
    pub name: String,
    pub extracts: Vec<Extract>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub fetched_at: i64,
    pub data: Vec<MapExtracts>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractsResponse {
    pub lang: String,
    pub fetched_at: i64,
    pub data: Vec<MapExtracts>,
}

#[derive(Debug, Deserialize)]
struct MapsResponse {
    maps: Vec<MapExtracts>,
}

#[derive(Debug, Deserialize)]
struct GraphQlEnvelope<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GqlError>,
}

#[derive(Debug, Deserialize)]
struct GqlError {
    message: String,
}

pub struct ExtractsCache {
    file: PathBuf,
    state: Mutex<HashMap<String, CacheEntry>>,
    http: Client,
}

impl ExtractsCache {
    pub async fn load(file: PathBuf) -> Result<Self> {
        let state = match tokio::fs::read_to_string(&file).await {
            Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
            Err(e) => {
                return Err(e).context(format!("read {}", file.display()));
            }
        };
        Ok(Self {
            file,
            state: Mutex::new(state),
            http: Client::builder()
                .user_agent("tarkov-checker-desktop")
                .build()
                .context("build http client")?,
        })
    }

    pub async fn get_or_fetch(&self, lang: &str) -> Result<ExtractsResponse> {
        let mut guard = self.state.lock().await;
        if let Some(entry) = guard.get(lang) {
            return Ok(ExtractsResponse {
                lang: lang.to_string(),
                fetched_at: entry.fetched_at,
                data: entry.data.clone(),
            });
        }
        let entry = self.fetch_one(lang).await?;
        guard.insert(lang.to_string(), entry.clone());
        let body = serde_json::to_string_pretty(&*guard).context("serialize cache")?;
        drop(guard);
        self.persist(&body).await?;
        Ok(ExtractsResponse {
            lang: lang.to_string(),
            fetched_at: entry.fetched_at,
            data: entry.data,
        })
    }

    pub async fn refresh(&self, lang: &str) -> Result<ExtractsResponse> {
        let entry = self.fetch_one(lang).await?;
        let mut guard = self.state.lock().await;
        guard.insert(lang.to_string(), entry.clone());
        let body = serde_json::to_string_pretty(&*guard).context("serialize cache")?;
        drop(guard);
        self.persist(&body).await?;
        Ok(ExtractsResponse {
            lang: lang.to_string(),
            fetched_at: entry.fetched_at,
            data: entry.data,
        })
    }

    async fn fetch_one(&self, lang: &str) -> Result<CacheEntry> {
        // tarkov.dev's GraphQL accepts the lang as an enum literal in the
        // query string — quoting it would 400. The TS client builds the
        // same string; we mirror it verbatim. Length + charset already
        // validated by the Tauri command before we get here.
        let query = format!(
            "{{ maps(lang: {lang}) {{ nameId name extracts {{ name faction position {{ x y z }} }} }} }}"
        );
        let body = serde_json::json!({ "query": query });
        let res = self
            .http
            .post(TARKOV_DEV_URL)
            .json(&body)
            .send()
            .await
            .context("POST tarkov.dev")?;
        let status = res.status();
        if !status.is_success() {
            anyhow::bail!("tarkov.dev API: HTTP {}", status.as_u16());
        }
        let env: GraphQlEnvelope<MapsResponse> =
            res.json().await.context("decode tarkov.dev response")?;
        if !env.errors.is_empty() {
            let joined: Vec<String> = env.errors.into_iter().map(|e| e.message).collect();
            anyhow::bail!("tarkov.dev API: {}", joined.join("; "));
        }
        let maps = env.data.context("tarkov.dev API: empty response")?.maps;
        Ok(CacheEntry {
            fetched_at: now_ms(),
            data: maps,
        })
    }

    async fn persist(&self, body: &str) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            tokio::fs::create_dir_all(dir)
                .await
                .with_context(|| format!("mkdir {}", dir.display()))?;
        }
        tokio::fs::write(&self.file, body)
            .await
            .with_context(|| format!("write {}", self.file.display()))?;
        Ok(())
    }
}

pub fn cache_file(data_dir: &Path) -> PathBuf {
    data_dir.join("extracts-cache.json")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
