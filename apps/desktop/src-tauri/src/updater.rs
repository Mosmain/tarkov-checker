//! Portable self-update via GitHub Releases.
//!
//! There is no installer: a running exe on Windows can't be deleted or
//! overwritten, but it CAN be renamed. Install therefore = download the new
//! exe next to the current one, rename current -> `.old.exe`, rename the
//! download into the current name, spawn it, exit. The fresh instance removes
//! the leftover `.old.exe` on startup (`cleanup_old`).

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Context};
use serde::{Deserialize, Serialize};

/// Repo the overlay updates from.
const REPO: &str = "Mosmain/tarkov-checker";
/// Release asset to download — CI uploads exactly this name.
const ASSET_NAME: &str = "tarkov-checker-desktop.exe";

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub release_url: String,
    /// Kept internal on purpose: `install_update` re-resolves the URL itself
    /// so the webview can never point the updater at an arbitrary host.
    #[serde(skip)]
    pub download_url: String,
}

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Debug, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// `"v1.2.3"` / `"1.2.3-rc1"` -> `[1, 2, 3]`. `None` for anything else.
fn parse_version(s: &str) -> Option<[u64; 3]> {
    let s = s.trim().trim_start_matches(['v', 'V']);
    let mut parts = s.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    // tolerate a suffix on the patch ("3-rc1" -> 3)
    let patch = parts
        .next()?
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some([major, minor, patch])
}

/// Strict ">" — equal, older, or unparseable versions are not "newer", so a
/// malformed tag can never trigger an install loop.
pub fn is_newer(remote: &str, current: &str) -> bool {
    match (parse_version(remote), parse_version(current)) {
        (Some(r), Some(c)) => r > c,
        _ => false,
    }
}

fn client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        // api.github.com rejects requests without a User-Agent.
        .user_agent(concat!("tarkov-checker/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(60))
        .build()
}

/// Latest published release, or `None` when up to date / no releases yet.
pub async fn check() -> anyhow::Result<Option<UpdateInfo>> {
    let resp = client()?
        .get(format!(
            "https://api.github.com/repos/{REPO}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .context("releases/latest request")?;
    // 404 = the repo has no published releases yet.
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let release: Release = resp
        .error_for_status()
        .context("releases/latest status")?
        .json()
        .await
        .context("releases/latest body")?;

    if !is_newer(&release.tag_name, current_version()) {
        return Ok(None);
    }
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == ASSET_NAME)
        .ok_or_else(|| anyhow!("release {} has no {ASSET_NAME} asset", release.tag_name))?;
    Ok(Some(UpdateInfo {
        current: current_version().to_string(),
        latest: release.tag_name.trim_start_matches(['v', 'V']).to_string(),
        release_url: release.html_url,
        download_url: asset.browser_download_url.clone(),
    }))
}

/// Downloads the new exe and swaps it into place. Returns the path of the
/// (now replaced) current exe so the caller can respawn it.
pub async fn download_and_swap(download_url: &str) -> anyhow::Result<PathBuf> {
    let exe = std::env::current_exe().context("current_exe")?;
    let bytes = client()?
        .get(download_url)
        .send()
        .await
        .context("asset download")?
        .error_for_status()
        .context("asset download status")?
        .bytes()
        .await
        .context("asset download body")?;
    // Sanity gate: a PE binary of plausible size, not an HTML error page.
    if bytes.len() < 1024 * 1024 || !bytes.starts_with(b"MZ") {
        return Err(anyhow!(
            "downloaded file does not look like the overlay exe ({} bytes)",
            bytes.len()
        ));
    }
    let staged = staged_path(&exe);
    tokio::fs::write(&staged, &bytes)
        .await
        .with_context(|| format!("write {}", staged.display()))?;
    swap(&exe, &staged).with_context(|| format!("swap into {}", exe.display()))?;
    Ok(exe)
}

/// The rename dance. On the second rename failing, rolls the first one back
/// so the app is left runnable.
fn swap(current: &Path, staged: &Path) -> std::io::Result<()> {
    let old = old_path(current);
    let _ = std::fs::remove_file(&old);
    std::fs::rename(current, &old)?;
    if let Err(e) = std::fs::rename(staged, current) {
        let _ = std::fs::rename(&old, current);
        return Err(e);
    }
    Ok(())
}

fn staged_path(current: &Path) -> PathBuf {
    current.with_extension("new.exe")
}

fn old_path(current: &Path) -> PathBuf {
    current.with_extension("old.exe")
}

/// Remove the `.old.exe` left by a previous update. Runs on a background
/// thread with retries — the previous instance may still be exiting (it can't
/// be deleted until its process is gone).
pub fn cleanup_old() {
    std::thread::spawn(|| {
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        let old = old_path(&exe);
        for _ in 0..20 {
            if !old.exists() || std::fs::remove_file(&old).is_ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- version comparison ------------------------------------------------

    #[test]
    fn is_newer_basic() {
        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
    }

    #[test]
    fn is_newer_strips_tag_prefix() {
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(is_newer("V0.2.0", "v0.1.0"));
    }

    #[test]
    fn is_newer_tolerates_patch_suffix() {
        assert!(is_newer("0.2.0-rc1", "0.1.0"));
    }

    #[test]
    fn is_newer_rejects_garbage() {
        assert!(!is_newer("latest", "0.1.0"));
        assert!(!is_newer("0.2", "0.1.0"));
        assert!(!is_newer("0.2.0.1", "0.1.0"));
        assert!(!is_newer("0.2.0", "not-a-version"));
    }

    // --- rename dance ------------------------------------------------------

    fn temp_file(name: &str, contents: &[u8]) -> PathBuf {
        let p = std::env::temp_dir().join(format!("tc-updater-test-{}-{name}", std::process::id()));
        std::fs::write(&p, contents).unwrap();
        p
    }

    #[test]
    fn swap_replaces_current_and_keeps_old() {
        let current = temp_file("current.exe", b"OLD");
        let staged = temp_file("current.new.exe", b"NEW");
        // temp_file names don't follow with_extension semantics — rename
        // staged to the path swap() derives.
        let staged_real = staged_path(&current);
        std::fs::rename(&staged, &staged_real).unwrap();

        swap(&current, &staged_real).unwrap();

        assert_eq!(std::fs::read(&current).unwrap(), b"NEW");
        assert_eq!(std::fs::read(old_path(&current)).unwrap(), b"OLD");
        assert!(!staged_real.exists());

        let _ = std::fs::remove_file(&current);
        let _ = std::fs::remove_file(old_path(&current));
    }

    #[test]
    fn swap_rolls_back_when_staged_missing() {
        let current = temp_file("rollback.exe", b"OLD");
        let staged = staged_path(&current); // never created

        assert!(swap(&current, &staged).is_err());
        // first rename rolled back — the app is still launchable
        assert_eq!(std::fs::read(&current).unwrap(), b"OLD");
        assert!(!old_path(&current).exists());

        let _ = std::fs::remove_file(&current);
    }
}
