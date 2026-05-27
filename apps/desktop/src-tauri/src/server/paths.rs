//! Port of `apps/server/src/watchers/paths.ts` + `registry.ts`.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PathSource {
    Env,
    Manual,
    Detected,
    Missing,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedPath {
    pub value: Option<String>,
    pub source: PathSource,
    pub exists: bool,
}

impl ResolvedPath {
    fn from(value: Option<String>, source: PathSource) -> Self {
        match value {
            None => Self {
                value: None,
                source: PathSource::Missing,
                exists: false,
            },
            Some(v) => {
                let exists = Path::new(&v).is_dir();
                Self {
                    value: Some(v),
                    source,
                    exists,
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPaths {
    pub game_dir: ResolvedPath,
    pub logs_dir: ResolvedPath,
    pub screenshots_dir: ResolvedPath,
}

#[derive(Debug, Clone, Default)]
pub struct ManualOverrides {
    pub game_dir: Option<String>,
    pub screenshots_dir: Option<String>,
}

fn read_env(key: &str) -> Option<String> {
    std::env::var(key).ok().and_then(|v| {
        let t = v.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    })
}

fn normalize(s: Option<&str>) -> Option<String> {
    s.and_then(|v| {
        let t = v.trim();
        if t.is_empty() { None } else { Some(t.to_string()) }
    })
}

/// Source-of-truth priority: env > manual > registry-detected.
pub fn resolve(manual: &ManualOverrides) -> ResolvedPaths {
    let detected_game = detect_tarkov_game_dir();
    let detected_documents = detect_documents_dir();

    let game = read_env("TARKOV_GAME_DIR")
        .map(|v| ResolvedPath::from(Some(v), PathSource::Env))
        .or_else(|| normalize(manual.game_dir.as_deref()).map(|v| ResolvedPath::from(Some(v), PathSource::Manual)))
        .unwrap_or_else(|| ResolvedPath::from(detected_game.clone(), PathSource::Detected));

    let logs = match read_env("TARKOV_LOG_DIR") {
        Some(v) => ResolvedPath::from(Some(v), PathSource::Env),
        None => {
            // Derived from gameDir; inherits its source for the badge.
            let derived = game
                .value
                .as_deref()
                .map(|g| PathBuf::from(g).join("Logs").to_string_lossy().into_owned());
            match derived {
                Some(p) => ResolvedPath::from(Some(p), game.source),
                None => ResolvedPath::from(None, PathSource::Missing),
            }
        }
    };

    let detected_screenshots = detected_documents.as_ref().map(|docs| {
        PathBuf::from(docs)
            .join("Escape from Tarkov")
            .join("Screenshots")
            .to_string_lossy()
            .into_owned()
    });

    let screenshots = read_env("TARKOV_SCREENSHOT_DIR")
        .map(|v| ResolvedPath::from(Some(v), PathSource::Env))
        .or_else(|| {
            normalize(manual.screenshots_dir.as_deref())
                .map(|v| ResolvedPath::from(Some(v), PathSource::Manual))
        })
        .unwrap_or_else(|| ResolvedPath::from(detected_screenshots, PathSource::Detected));

    ResolvedPaths {
        game_dir: game,
        logs_dir: logs,
        screenshots_dir: screenshots,
    }
}

// --- Registry detection --------------------------------------------------

/// Reads HKCU\...\User Shell Folders\Personal. Honours OneDrive/Documents
/// redirection. winreg already returns expanded paths for REG_EXPAND_SZ via
/// the same `get_value` call when typed as `String`, so we don't have to
/// re-implement `expandWinVars` ourselves.
pub fn detect_documents_dir() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
        .ok()?;
    let raw: String = key.get_value("Personal").ok()?;
    Some(expand_env_vars(&raw))
}

/// BSG launcher writes the install location to one of these keys; try in
/// order. winreg auto-redirects WOW6432Node access.
pub fn detect_tarkov_game_dir() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let candidates: &[(winreg::HKEY, &str)] = &[
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Battlestate Games\EFT"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Battlestate Games\EFT"),
        (HKEY_CURRENT_USER, r"Software\Battlestate Games\EFT"),
    ];
    for (hive, path) in candidates {
        if let Ok(key) = RegKey::predef(*hive).open_subkey(path) {
            if let Ok(raw) = key.get_value::<String, _>("InstallLocation") {
                return Some(expand_env_vars(&raw));
            }
        }
    }
    None
}

fn expand_env_vars(value: &str) -> String {
    // winreg already expands REG_EXPAND_SZ when value is read as String,
    // but the Personal value sometimes comes back as REG_SZ with literal
    // %USERPROFILE% etc — replicate the JS-side expandWinVars to cover
    // that edge case identically.
    let re = regex::Regex::new(r"%([^%]+)%").expect("static regex");
    re.replace_all(value, |caps: &regex::Captures<'_>| {
        let name = &caps[1];
        std::env::var(name).unwrap_or_else(|_| format!("%{name}%"))
    })
    .into_owned()
}
