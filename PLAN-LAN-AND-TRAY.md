# Plan: LAN-phone (D) + Tray UI (E)

Implementation plan for the LAN-phone + tray-UI iterations. Designed to
be picked up cold by a fresh session.

For broader context see [CLAUDE.md](./CLAUDE.md) — especially the
"In-process HTTP server" and "Tarkov path resolution" sections.

---

## Architecture (simplified)

Earlier iterations of this plan had an opt-in `lanMode` toggle plus a
bearer-token auth scheme, with a tray "Enable LAN mode" item, a
"Reset pairing" item, and token-in-fragment QR codes. That was scoped
back to the trust model the user actually wants:

> Same Wi-Fi = trusted. No token. Just show the LAN URL.

Concrete consequences:

- Helper **always** binds `0.0.0.0:47474`. No `lanMode` field in
  `config.json`. No restart-on-toggle.
- No `auth_guard`, no `AuthToken` state, no Credential Manager
  storage. `auth.rs` deleted.
- QR encodes the bare LAN URL (`http://<lan-ip>:47474/`). No token
  fragment, no localStorage shuffling on the phone, no hash-bootstrap
  in `main.ts`.
- `CorsLayer` Origin allowlist still gates browser drive-by callers
  (hosted-page XHR from anything not on the allowlist gets no ACAO).
  Curl-equivalents from the LAN are unfiltered by design.
- Tray loses E5 ("Enable LAN") and E6 ("Reset pairing") entirely —
  there's nothing left to toggle or reset.

What the user gets, end to end:

```
                 Wi-Fi LAN
   ┌─────────────────────────────────────┐
   │                                     │
   │   PC running tarkov-checker.exe     │
   │   ─────────────────────────────     │
   │     Tauri overlay window  ──────┐   │
   │       (existing scenario)       │   │
   │                                 ▼   │
   │     Helper:                         │
   │     - 0.0.0.0:47474                 │
   │     - /api/* /events                │
   │     - GET / → embedded SPA          │
   │                          ▲          │
   │                          │ http     │
   │   ┌──────────────────────┘          │
   │   │                                 │
   │   │  Phone in LAN                   │
   │   │  ────────────                   │
   │   │  Scans QR → opens               │
   │   │  http://<pc-ip>:47474/          │
   │   │  → SPA loads same-origin        │
   │   │  → works                        │
   │   │                                 │
   └─────────────────────────────────────┘
```

Cross-network (phone on cellular, ПК at home) is **out of scope** —
needs tunneling (cloudflared / Tailscale Funnel / ngrok). Documented
as future work.

---

## D — LAN-phone unlock (done)

All of D landed and is verified end-to-end on a real phone (same
Wi-Fi). Summary of what's in the tree:

### D1 — Embed SPA into the .exe ✅

`rust-embed = "8"` + `mime_guess = "2"` in
`apps/desktop/src-tauri/Cargo.toml`. `EmbeddedSpa` struct pointing at
`../../client/dist/`, `spa_fallback` handler that serves the literal
asset (with the right MIME) or falls back to `index.html` (SPA
history mode), wired as `.fallback(spa_fallback)` after the API/SSE
routes.

Debug builds read from disk at request time. Release builds bake the
bytes in. `compression` feature is NOT enabled — it pulls in
`zstd-sys` which crashes rustc on this Windows host (CLAUDE.md
"Windows build quirks"). Re-evaluate in CI later.

### D2 — DROPPED ✂

No `lanMode` toggle. Helper always `0.0.0.0:47474`. The earlier
restart-on-toggle plumbing is removed.

### D3 — DROPPED ✂

No bearer-token auth. `auth.rs`, `auth_guard`, `AuthToken`,
`extract_bearer_token`, `token_matches`, `paired` field on `/api/ping`
all removed. CORS allowlist remains the browser-side gate.

### D4 — QR pairing ✅

`qrcode = "0.14"` (only `svg` feature) + `local-ip-address = "0.6"`.
`src/lan.rs::detect_lan_ip()` with multi-NIC heuristic (filters
`vEthernet` / `wsl` / `docker` / `vmware` etc. by name, ranks survivors
192.168 > 10 > 172.16-31 > other).

`pairing_qr` Tauri command returns `{url, svg}` where `url =
http://<lan-ip>:47474/` (no token). `PairingModal.vue` on every
`onMounted` calls `invoke('pairing_qr')` so a Wi-Fi change between
openings picks up the new IP.

Frontend `shared/config.ts` distinguishes three contexts via
`isHelperServed()` (page on port 47474) — dev mode uses Vite proxy,
helper-served goes same-origin (critical for the phone case), hosted
SPA on GitHub Pages goes cross-origin to `http://localhost:47474`
through the localhost-exception.

`PairingSection.vue` in Settings drawer → System group (order 30,
`visible: 'tauri'`), one button with `pi-qrcode` icon, opens the modal
via `useOverlayStore().pairingModalOpen`.

i18n keys under `pairing.*` in both `en.json` and `ru.json`.

---

## E — Tray UI (DONE)

Goal: replace the "open the overlay window to do anything" UX with a
Windows system-tray icon. Overlay becomes optional; tray is the
always-available control surface.

**Implemented — but client-side, not the Rust plan sketched below.** The tray
lives in `apps/client/src/features/overlay/composables/useTrayIcon.ts` via the
`@tauri-apps/api/tray` + `/menu` JS API (mounted from `App.vue`), not a Rust
`TrayIconBuilder` / `tray.rs`. No `tray.rs` exists. The E1–E7 Rust sketches
below are kept as historical context only; the actual menu and behaviour:

- **Menu** (opens on right-click; left-click restores the window — Windows
  convention, `showMenuOnLeftClick: false`):
  `☑ Lock (click-through)` · ─ · `Show window` · ─ · `☑ Always on top` ·
  `☑ Player follow` · ─ · `Pair phone` · `Copy LAN URL` · ─ · `Quit`.
  The three `CheckMenuItem`s mirror their stores and re-sync via watchers when
  toggled elsewhere (lock hotkey, settings drawer, quick menu). Menu layout
  follows the UX rule "promote only actions worth doing mid-game, when the
  fullscreen game hides the overlay" — sliders (opacity/zoom) and one-shot
  config stay in the drawer.
- **Pair phone** sets `useOverlayStore().pairingModalOpen = true` and shows the
  window — no Rust `show-pairing-modal` event/listener needed (the JS tray
  shares the Pinia store directly, so the App.vue listener from the E4 sketch
  was unnecessary).
- **Copy LAN URL** calls a native `copy_lan_url` Tauri command (`commands.rs`)
  that writes `http://<lan-ip>:47474/` to the clipboard via
  `tauri-plugin-clipboard-manager`'s Rust `ClipboardExt`. Native (not
  `navigator.clipboard`) because a tray-menu click grants no DOM user-gesture,
  so the webview clipboard API would be rejected. URL building shares the
  `lan_url()` helper with `pairing_qr`. No capability entry needed — the write
  is Rust-side, not a webview IPC call.
- **Close → tray:** `minimizeToTray` now defaults **true**, so the in-app ✕
  parks the overlay in the tray (`useCloseConfirm.ts` calls `window.hide()`);
  `Quit` in the tray is the canonical exit. Users can flip the setting off for
  ✕ = confirmed quit.
- **First-close hint:** the first time the overlay parks in the tray,
  `useCloseConfirm` fires a native Windows toast ("still running in the tray")
  via the `notify_tray_hint` Tauri command (the window is already hidden, so an
  in-app toast couldn't be seen). Shown once, gated by the persisted
  `tc.overlay.trayHintShown` flag. The toast is attributed to this app's
  name + favicon (not PowerShell) by registering our own AppUserModelID in
  HKCU and emitting via `tauri-winrt-notification` — `tauri-plugin-notification`
  was tried first but skips the AUMID for exes run from `target/release` (our
  portable build), leaving PowerShell's identity. See `src/notify.rs` and
  CLAUDE.md "Windows build quirks" item 8. The app icons themselves were also
  regenerated from `favicon.svg` (`tauri icon`), replacing the purple
  placeholders for the tray / window / taskbar too.

Surface area after the simplification:

| Item              | Action                                                    |
| ----------------- | --------------------------------------------------------- |
| Open dashboard    | `show()` + `unminimize()` + `set_focus()` on overlay      |
| Pair phone        | Emit `show-pairing-modal` event; App.vue flips store flag |
| Copy pairing URL  | Build LAN URL via `detect_lan_ip`, copy to clipboard      |
| Quit              | `app.exit(0)`                                             |

Four items, separator between "Open dashboard" and the pair pair, and
between the pair pair and Quit.

### E1 — Tray icon skeleton

**Plan:**

1. Tauri 2 ships `tauri::tray::TrayIconBuilder`. Wire up in `lib.rs`
   `setup` hook after `app.manage(...)` calls.

   ```rust
   use tauri::tray::TrayIconBuilder;
   use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

   let open_item = MenuItem::with_id(app, "open_dashboard",
       "Open dashboard", true, None::<&str>)?;
   let pair_phone = MenuItem::with_id(app, "pair_phone",
       "Pair phone", true, None::<&str>)?;
   let copy_url = MenuItem::with_id(app, "copy_url",
       "Copy LAN URL", true, None::<&str>)?;
   let separator1 = PredefinedMenuItem::separator(app)?;
   let separator2 = PredefinedMenuItem::separator(app)?;
   let quit = MenuItem::with_id(app, "quit", "Quit", true,
       None::<&str>)?;

   let menu = Menu::with_items(app, &[
       &open_item, &separator1,
       &pair_phone, &copy_url,
       &separator2, &quit,
   ])?;

   TrayIconBuilder::with_id("main")
       .icon(app.default_window_icon().unwrap().clone())
       .menu(&menu)
       .show_menu_on_left_click(true)
       .on_menu_event(|app, event| tray::handle_event(app, event))
       .build(app)?;
   ```

2. New `apps/desktop/src-tauri/src/tray.rs` with `handle_event` plus
   per-action functions, dispatched by `event.id().as_ref()`.

3. **Icon**: reuse `apps/desktop/src-tauri/icons/icon.ico` via
   `app.default_window_icon()` — `tauri.conf.json` already has the
   icons section, no change needed.

**Files:**

- `apps/desktop/src-tauri/src/lib.rs` — TrayIconBuilder block
- `apps/desktop/src-tauri/src/tray.rs` — NEW

### E2 — "Open dashboard"

```rust
fn handle_open_dashboard(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
```

No browser open, no hosted URL — the overlay IS the dashboard.

### E3 — "Copy LAN URL"

```rust
fn handle_copy_url(app: &AppHandle) {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let ip = match crate::lan::detect_lan_ip() {
        Some(ip) => ip,
        None => { eprintln!("[tray] no LAN IP detected"); return; }
    };
    let url = format!("http://{ip}:{}/", crate::http_server::LISTEN_PORT);
    if let Err(err) = app.clipboard().write_text(url) {
        eprintln!("[tray] clipboard write failed: {err}");
    }
}
```

Requires `tauri-plugin-clipboard-manager` dep + a capability entry.

### E4 — "Pair phone"

Brings the overlay window forward and emits `show-pairing-modal`.
App.vue listens and flips `useOverlayStore().pairingModalOpen`.

```rust
fn handle_pair_phone(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("show-pairing-modal", ());
    }
}
```

App.vue (one new listener, no new component):

```ts
import { listen } from '@tauri-apps/api/event';
import { useOverlayStore } from '@/features/overlay/store';

onMounted(async () => {
  if (!isTauri) return;
  const unlisten = await listen('show-pairing-modal', () => {
    useOverlayStore().pairingModalOpen = true;
  });
  onBeforeUnmount(unlisten);
});
```

### E7 — "Quit"

```rust
fn handle_quit(app: &AppHandle) {
    app.exit(0);
}
```

`app.exit()` runs proper Tauri teardown.

---

## Dependency order

```
D1 ✅ ─┬─→ D4 ✅ ─→ E4 (uses PairingModal which uses pairing_qr)
       │
       └─→ E1 (skeleton) ─→ E2/E3/E4/E7 handlers
```

E1 is the only blocker for E2-E7. ~1-2 hours total for the tray work.

---

## Verification matrix

| Scenario                              | Status      |
| ------------------------------------- | ----------- |
| Tauri overlay (existing IPC path)     | works ✅    |
| Hosted SPA on same PC                 | works ✅    |
| Helper-served SPA in same-PC browser  | works ✅    |
| Vite dev at `<lan-ip>:5173` on phone  | works ✅    |
| Helper at `<lan-ip>:47474` on phone   | works ✅    |
| Cross-network phone (cellular etc.)  | out of scope (needs tunnel) |
| Helper down                           | "Helper not running" UI |

---

## Out-of-scope (future work)

- **Cross-network access.** Phone on cellular hitting helper at home.
  Needs the user to run a tunnel (`cloudflared`, Tailscale Funnel,
  ngrok) and the SPA to know the tunnel URL. Could land later as a
  "Connect over internet" advanced setting.
- **LAN-side auth.** If the trust-model ever needs to harden (coffee
  shop Wi-Fi, malicious LAN device), token-via-QR can come back. The
  earlier implementation lives in git history if a rewind is needed.
- **Compression for `rust-embed`.** Pulls `zstd-sys` which crashes
  rustc locally. Enable in CI.

---

## File checklist (cumulative, E remaining)

```
# As built (client-side tray), not the original Rust plan:
apps/desktop/src-tauri/Cargo.toml                      [+tauri-plugin-clipboard-manager, +tauri-winrt-notification]
apps/desktop/src-tauri/src/lib.rs                      [.plugin(clipboard init), notify::register_aumid in setup, copy_lan_url/notify_tray_hint in handler]
apps/desktop/src-tauri/src/commands.rs                 [lan_url() helper + copy_lan_url + notify_tray_hint commands]
apps/desktop/src-tauri/src/notify.rs                   [NEW: AUMID registration + winrt toast]
apps/desktop/src-tauri/icons/*                         [regenerated from favicon.svg via `tauri icon`]

apps/client/src/features/overlay/composables/useTrayIcon.ts  [full menu: checkmarks, pair, copy, left-click restore]
apps/client/src/features/overlay/composables/useCloseConfirm.ts [first-close tray notification]
apps/client/src/features/overlay/store.ts              [minimizeToTray default → true, trayHintShown flag]
apps/client/src/features/i18n/locales/en.json + ru.json [tray menu + trayHint strings]

# Not needed in the end: capabilities/default.json (Rust-side clipboard write),
# tray.rs (tray is JS), tauri.conf.json (tray-icon feature already present),
# App.vue listener (JS tray flips the store directly).
```

---

## Quick-reference commands

```powershell
# Dev (Vite + Tauri).
pnpm --filter @tarkov-checker/desktop tauri:dev

# Build production overlay (.exe with embedded SPA).
pnpm overlay:build

# Build hosted SPA for GitHub Pages.
$env:GITHUB_PAGES = 'true'; pnpm --filter @tarkov-checker/client build

# Local checks.
pnpm typecheck && pnpm lint && pnpm test
cd apps/desktop/src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --lib  # Windows host is flaky — push a tag if it crashes locally.

# Test helper directly (no UI).
curl http://localhost:47474/api/ping
curl http://localhost:47474/api/config
curl -N http://localhost:47474/events
```
