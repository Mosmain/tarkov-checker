//! Windows toast notifications attributed to this app (its name + icon)
//! rather than PowerShell.
//!
//! `tauri-plugin-notification` only stamps the toast's AppUserModelID when the
//! exe runs from somewhere other than `target/{debug,release}`. Our portable
//! .exe ships straight out of `target/release` (and dev runs from
//! `target/debug`), so the plugin always skips it and notify-rust falls back
//! to its PowerShell identity — which is what shows up as the toast's author.
//!
//! We sidestep that by registering our OWN AppUserModelID in HKCU (with a
//! DisplayName + IconUri) and emitting the toast through
//! `tauri-winrt-notification` with that id. No installer / Start-Menu shortcut
//! required, so it works for the portable build.

use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_winrt_notification::Toast;

// The app mark — the same one the browser build shows — baked in at compile
// time from icons/128x128.png (regenerated from favicon.svg via `tauri icon`).
// Written to disk on launch so the AUMID's IconUri can point at a real file.
const ICON_BYTES: &[u8] = include_bytes!("../icons/128x128.png");

/// Registers `HKCU\Software\Classes\AppUserModelId\<identifier>` with a
/// DisplayName + IconUri so Windows shows this app's name and icon on toasts
/// instead of PowerShell's. Idempotent and best-effort: any failure just
/// leaves toasts with a generic identity, so errors are logged, not
/// propagated. `data_dir` is the already-created `%APPDATA%/raidmate`
/// folder (sibling to config.json).
pub fn register_aumid(app: &AppHandle, data_dir: &Path) {
    let aumid = app.config().identifier.clone();
    let icon_path = match write_icon(data_dir) {
        Ok(path) => path,
        Err(err) => {
            eprintln!("[notify] icon write failed: {err}");
            return;
        }
    };
    if let Err(err) = write_registry(&aumid, &icon_path) {
        eprintln!("[notify] AUMID registration failed: {err}");
    }
}

fn write_icon(data_dir: &Path) -> std::io::Result<PathBuf> {
    let path = data_dir.join("notification-icon.png");
    std::fs::write(&path, ICON_BYTES)?;
    Ok(path)
}

fn write_registry(aumid: &str, icon_path: &Path) -> std::io::Result<()> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(format!("Software\\Classes\\AppUserModelId\\{aumid}"))?;
    key.set_value("DisplayName", &"RaidMate")?;
    key.set_value("IconUri", &icon_path.display().to_string())?;
    Ok(())
}

/// Emits a toast attributed to our registered AUMID. Title + body arrive
/// pre-localised from the webview.
pub fn show_toast(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    let aumid = app.config().identifier.clone();
    Toast::new(&aumid)
        .title(title)
        .text1(body)
        .show()
        .map_err(|err| err.to_string())
}
