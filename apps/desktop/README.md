# @tarkov-checker/desktop

Tauri 2 wrapper around `@tarkov-checker/client`. In dev the window points
at the Vite server `beforeDevCommand` spawns on `http://localhost:5173`.
Release build bundles `apps/client/dist` into the .exe (and the helper
serves the same files for phone access on `:47474`).

## Requirements

- Rust (stable) — install via https://rustup.rs/
- Tauri 2 system prerequisites — https://v2.tauri.app/start/prerequisites/

## Dev

```pwsh
# One command — Tauri spawns Vite, then opens the window
pnpm --filter @tarkov-checker/desktop tauri:dev
```

`beforeDevCommand` in `tauri.conf.json` is
`pnpm --filter @tarkov-checker/client dev`, so Tauri starts the Vite
dev server (`:5173`) itself and shuts it down on exit — no separate
terminal needed.

## Production build

```pwsh
pnpm --filter @tarkov-checker/desktop tauri:build
```

`beforeBuildCommand` builds the client first; Tauri then bundles
`apps/client/dist` into the installer.

## What this crate does

More than a thin wrapper now. The same `.exe` is both the overlay and a
local backend:

- **Frameless transparent overlay** — `decorations: false`,
  `transparent: true`, `shadow: false`. Always-on-top, click-through
  (lock), opacity and zoom are driven from the webview via Tauri window
  APIs.
- **In-process axum HTTP server on `0.0.0.0:47474`** — `GET /api/ping`,
  `GET`/`PUT /api/config`, `GET`/`PUT /api/hotkeys`,
  `POST /api/hotkeys/{suspend,resume}`, and `GET /events` (SSE). Backs
  any same-Wi-Fi browser/phone; release builds also serve the embedded
  SPA from `/`.
- **Backend-owned OS-global hotkeys** — zoom/floor/airdrop combos are
  registered by the backend and broadcast as `command` events to every
  client (overlay, browser, LAN phone). Only the overlay lock combo is
  client-registered.
- **Tauri IPC commands** — `get_config`, `update_config`, `get_hotkeys`,
  `update_hotkeys`, `suspend_hotkeys`, `resume_hotkeys`, `pairing_qr`
  (LAN QR pairing).
- **System-tray icon** — created client-side via the Tauri JS tray API
  (`apps/client/.../overlay/composables/useTrayIcon.ts`): toggle-lock,
  show window, quit. A richer Rust-side tray menu (pair phone / copy LAN
  URL) is still planned — see `PLAN-LAN-AND-TRAY.md`, section E.

For full detail see the repo `CLAUDE.md` — "Desktop overlay",
"Backend-owned hotkeys", and "In-process HTTP server".
