//! Bearer-token bootstrap and storage.
//!
//! The token lives in Windows Credential Manager (per-user store via
//! `keyring`) and is generated on first run. It identifies external HTTP
//! clients — the hosted frontend at the future `app.tarkov-checker.com`
//! and the LAN-phone served via QR — and is matched against the
//! `Authorization: Bearer …` header by [`crate::http_server`].
//!
//! The Tauri webview does NOT use this token: it talks to the Rust core
//! over IPC, which has its own trust boundary (the webview runs the
//! signed-and-shipped bundle, not an attacker page).
//!
//! Threat model: low-stakes (player position in raid + a few path
//! overrides). Token rotation is supported via [`reset`] and is the
//! intended response to "I accidentally screenshotted my pairing URL"
//! style mistakes — wired into the tray menu later.

use anyhow::{Context, Result};
use getrandom::getrandom;
use keyring::Entry;
use std::fmt::Write;

const SERVICE: &str = "tarkov-checker";
const USERNAME: &str = "auth-token";

/// Newtype wrapper so the token can live in Tauri's `State<'_, AuthToken>`
/// without colliding with anyone else who stashes a `String` there. Cheap
/// to clone — it's a 64-byte string.
#[derive(Debug, Clone)]
pub struct AuthToken(pub String);

/// Reads the persisted token from Credential Manager, generating + saving
/// a new one on first run. Errors propagate the underlying keyring failure
/// so the user sees what went wrong (e.g. CredMan service unreachable on a
/// stripped-down Windows install).
pub fn load_or_create() -> Result<String> {
    let entry = Entry::new(SERVICE, USERNAME).context("opening credential manager entry")?;
    match entry.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => {
            let new_token = generate_token();
            entry
                .set_password(&new_token)
                .context("writing new auth token to credential manager")?;
            Ok(new_token)
        }
        Err(err) => Err(err).context("reading auth token from credential manager"),
    }
}

/// Deletes the persisted token so the next [`load_or_create`] returns a
/// fresh one. Clients that still carry the old token will see 401 on
/// their next request — by design; this is what "Reset pairing" means.
/// Idempotent: deleting a missing entry is treated as success.
#[allow(dead_code)] // wired in when the tray menu lands
pub fn reset() -> Result<()> {
    let entry = Entry::new(SERVICE, USERNAME).context("opening credential manager entry")?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err).context("deleting auth token from credential manager"),
    }
}

/// 32 cryptographically-random bytes rendered as 64 hex characters.
/// Hex (vs base64) keeps the alphabet URL-safe without `=` padding and
/// avoids pulling in a base64 crate; the extra 21 chars on the wire are
/// noise we won't notice.
fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    // CSPRNG-backed; on Windows this is BCryptGenRandom. Failure means
    // the OS RNG itself is broken, which is unrecoverable — crashing is
    // the right response since we cannot safely produce a token.
    getrandom(&mut bytes).expect("system CSPRNG unavailable");
    let mut hex = String::with_capacity(64);
    for byte in bytes {
        write!(hex, "{:02x}", byte).expect("writing to String never fails");
    }
    hex
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_token_is_64_hex_chars() {
        let t = generate_token();
        assert_eq!(t.len(), 64);
        assert!(t
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn generate_token_is_unique_per_call() {
        // Two calls should produce different values with overwhelming
        // probability — 2^256 collision space.
        let a = generate_token();
        let b = generate_token();
        assert_ne!(a, b);
    }
}
