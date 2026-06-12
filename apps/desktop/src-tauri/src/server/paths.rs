//! Resolve Tarkov directory paths. Priority order: env vars
//! (`TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR`) > manual overrides from
//! `ConfigStore` > Windows-registry auto-detect (BSG launcher writes
//! `InstallLocation`). `logsDir` is always derived as
//! `<gameDir>/Logs` — no separate override.

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

/// What `GET`/`PUT /api/config` (and the Tauri equivalents) return: the
/// resolved path table plus the behaviour flags that live alongside paths in
/// `config.json`. Flattened so the wire shape is
/// `{ gameDir, logsDir, screenshotsDir, deleteScreenshots }` — matching
/// `serverConfigResponseSchema` in `@shared/config-api`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    #[serde(flatten)]
    pub paths: ResolvedPaths,
    pub delete_screenshots: bool,
}

#[derive(Debug, Clone, Default)]
pub struct ManualOverrides {
    pub game_dir: Option<String>,
    pub screenshots_dir: Option<String>,
}

fn read_env(key: &str) -> Option<String> {
    std::env::var(key).ok().and_then(|v| {
        let t = v.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    })
}

/// Trim whitespace and silently discard UNC paths (`\\server\share` /
/// `//server/share`). Returns `None` for empty strings or UNC paths.
///
/// UNC paths are rejected here as a defence-in-depth measure during
/// resolution; the primary rejection happens in `config::normalize` before
/// any value reaches persistent storage.
fn normalize(s: Option<&str>) -> Option<String> {
    s.and_then(|v| {
        let t = v.trim();
        if t.is_empty() {
            return None;
        }
        if t.starts_with("\\\\") || t.starts_with("//") {
            eprintln!("[paths] ignoring UNC manual override: {t}");
            return None;
        }
        Some(t.to_string())
    })
}

/// Source-of-truth priority: env > manual > registry-detected.
pub fn resolve(manual: &ManualOverrides) -> ResolvedPaths {
    let detected_game = detect_tarkov_game_dir();
    let detected_documents = detect_documents_dir();

    let game = read_env("TARKOV_GAME_DIR")
        .map(|v| ResolvedPath::from(Some(v), PathSource::Env))
        .or_else(|| {
            normalize(manual.game_dir.as_deref())
                .map(|v| ResolvedPath::from(Some(v), PathSource::Manual))
        })
        .unwrap_or_else(|| ResolvedPath::from(detected_game.clone(), PathSource::Detected));

    // Logs always live at `<gameDir>/Logs` — no separate override path.
    // Source badge inherits from `gameDir` so the UI shows one origin.
    let logs = match game
        .value
        .as_deref()
        .map(|g| PathBuf::from(g).join("Logs").to_string_lossy().into_owned())
    {
        Some(p) => ResolvedPath::from(Some(p), game.source),
        None => ResolvedPath::from(None, PathSource::Missing),
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

/// Reads `InstallLocation` from the BSG launcher's standard uninstall entry
/// (32-bit view / native / per-user hives). A value whose directory exists
/// wins over a stale one.
pub fn detect_tarkov_game_dir() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    const UNINSTALL_EFT: &str =
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\EscapeFromTarkov";
    const UNINSTALL_EFT_WOW: &str =
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\EscapeFromTarkov";
    let candidates: &[(winreg::HKEY, &str)] = &[
        (HKEY_LOCAL_MACHINE, UNINSTALL_EFT_WOW),
        (HKEY_LOCAL_MACHINE, UNINSTALL_EFT),
        (HKEY_CURRENT_USER, UNINSTALL_EFT),
    ];
    let mut first_found: Option<String> = None;
    for (hive, path) in candidates {
        if let Ok(key) = RegKey::predef(*hive).open_subkey(path) {
            if let Ok(raw) = key.get_value::<String, _>("InstallLocation") {
                let expanded = expand_env_vars(&raw);
                if Path::new(&expanded).is_dir() {
                    return Some(expanded);
                }
                first_found.get_or_insert(expanded);
            }
        }
    }
    first_found
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

#[cfg(test)]
mod tests {
    use super::*;

    // --- expand_env_vars -----------------------------------------------------

    #[test]
    fn expand_env_vars_no_vars_passthrough() {
        let input = r"D:\Foo\Bar";
        assert_eq!(expand_env_vars(input), input);
    }

    #[test]
    fn expand_env_vars_unknown_var_kept_literal() {
        // An env var that certainly doesn't exist must be left as-is.
        let input = r"%TARKOV_CHECKER_NONEXISTENT_TEST_VAR%\Foo";
        let result = expand_env_vars(input);
        assert_eq!(result, input, "unknown var must remain as literal %VAR%");
    }

    #[test]
    fn expand_env_vars_known_var_expanded() {
        // Use APPDATA which is always set on Windows CI. If for some reason
        // it is not set (unusual CI image), we treat the var as unknown and
        // the test documents it explicitly.
        let expected = match std::env::var("APPDATA") {
            Ok(val) => format!(r"{val}\raidmate"),
            Err(_) => r"%APPDATA%\raidmate".to_string(),
        };
        let result = expand_env_vars(r"%APPDATA%\raidmate");
        assert_eq!(result, expected);
    }

    #[test]
    fn expand_env_vars_multiple_vars_in_one_string() {
        // Both vars absent → both kept as literals; no panic, no partial expand.
        let input = "%TARKOV_CHECKER_NONEXISTENT_A%\\middle\\%TARKOV_CHECKER_NONEXISTENT_B%";
        let result = expand_env_vars(input);
        assert_eq!(result, input);
    }

    // --- normalize (paths module version) ------------------------------------
    // This normalize is the defence-in-depth one used during resolution —
    // distinct from config::normalize but same semantics.

    #[test]
    fn paths_normalize_none_returns_none() {
        assert_eq!(normalize(None), None);
    }

    #[test]
    fn paths_normalize_empty_returns_none() {
        assert_eq!(normalize(Some("")), None);
    }

    #[test]
    fn paths_normalize_whitespace_returns_none() {
        assert_eq!(normalize(Some("   ")), None);
    }

    #[test]
    fn paths_normalize_plain_path_preserved() {
        assert_eq!(
            normalize(Some(r"D:\Tarkov")),
            Some(r"D:\Tarkov".to_string())
        );
    }

    #[test]
    fn paths_normalize_trims_whitespace() {
        assert_eq!(
            normalize(Some(r"  D:\Tarkov  ")),
            Some(r"D:\Tarkov".to_string())
        );
    }

    #[test]
    fn paths_normalize_unc_backslash_returns_none() {
        // Defence-in-depth: UNC paths silently dropped (unlike config::normalize
        // which returns Err — here None is the contract).
        assert_eq!(normalize(Some(r"\\server\share")), None);
    }

    #[test]
    fn paths_normalize_unc_forward_slash_returns_none() {
        assert_eq!(normalize(Some("//server/share")), None);
    }

    /// Machine-dependent diagnostic, excluded from CI. Run manually on a box
    /// with EFT installed: `cargo test detect_tarkov_live -- --ignored --nocapture`.
    #[test]
    #[ignore = "probes the real registry — run manually on a machine with EFT"]
    fn detect_tarkov_live_probe() {
        let detected = detect_tarkov_game_dir();
        println!("detected game dir: {detected:?}");
        println!("detected documents dir: {:?}", detect_documents_dir());
        assert!(detected.is_some(), "no registry key yielded a game dir");
    }
}
