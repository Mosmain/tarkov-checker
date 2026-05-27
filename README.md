# tarkov-checker

Live in-raid map for Escape from Tarkov. Watches Tarkov's screenshot
folder, parses player position from F12-overlay filenames, and renders
the result on a Leaflet map with the community SVG layers.

Two consumption modes share the same Vue client:

1. **Desktop overlay** (primary): a single Tauri 2 `.exe` that includes
   the screenshot watcher, registry probe, and tarkov.dev fetch+cache
   natively in Rust. Frameless transparent always-on-top window with
   click-through lock, global hotkeys, and a system-tray fallback.
2. **LAN / phone PWA** (optional): a Node/Fastify server on the PC and
   the same Vue client as a Progressive Web App on the phone. The
   phone hits the PC over WebSocket+HTTP on the local network. This
   path requires running `pnpm dev` on the PC — the overlay `.exe`
   does **not** expose a LAN endpoint.

## Quick start — using a pre-built binary

Grab `tarkov-checker-desktop.exe` from the latest [Release](../../releases),
drop it anywhere on disk (Desktop, a flash drive, wherever), double-click.
First launch auto-detects your Tarkov install via the registry; if the
launcher didn't write the registry key you can set paths manually in
Settings → Tarkov paths. State lives in `%APPDATA%/tarkov-checker/`
(`config.json` for path overrides, `extracts-cache.json` for the
tarkov.dev extract data).

The overlay is fully portable — no installer, no admin rights, no
service. Close = exit; no background process lingers.

## Quick start — building from source

```pwsh
git clone --recurse-submodules https://github.com/Mosmain/tarkov-checker.git
cd tarkov-checker
pnpm install
```

`--recurse-submodules` pulls the SVG maps repo into
`apps/client/public/maps/`. See [CREDITS.md](CREDITS.md) for attribution
and licensing of those.

### Prerequisites

- Node.js 20+ (pinned via `.nvmrc`)
- pnpm 10+ (pinned via `packageManager` in root `package.json`)
- For `apps/desktop` only: Rust stable (via [rustup](https://rustup.rs/))
  plus the Tauri 2 [Windows prerequisites](https://v2.tauri.app/start/prerequisites/)
  — concretely the Visual Studio "Desktop development with C++"
  workload. WebView2 ships with Windows 11.

Locally building the overlay on Windows has well-known footguns (HVCI,
Defender, MSVC spawn quirks) — see [CLAUDE.md § Windows build quirks](CLAUDE.md).
Releases are built in CI on a clean `windows-latest` runner — if you
don't want to fight the local toolchain, grab the .exe from the
[latest Release](../../releases) instead.

## Tarkov paths

Two paths matter:

- **Game folder** — where Tarkov is installed (e.g. `D:\EFT`). Logs are
  read from `<gameFolder>\Logs`.
- **Screenshots folder** — where the F12 overlay drops `.png` files
  (typically `<Documents>\Escape from Tarkov\Screenshots`).

Resolution priority, highest first:

1. Environment variables: `TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR`,
   optional `TARKOV_LOG_DIR`. In dev these can come from a `.env` at
   the repo root (Node `--env-file-if-exists`).
2. Manual override saved through the in-app Settings panel:
   - **Overlay (Tauri):** `%APPDATA%/tarkov-checker/config.json`
   - **Node server (LAN mode):** `apps/server/data/config.json` (gitignored)
3. Auto-detect from the Windows registry: the `Personal` shell folder
   for Documents (so OneDrive-redirected Documents resolves correctly),
   and `Battlestate Games\EFT\InstallLocation` for the game folder
   (BSG Launcher writes this at install time).

If auto-detect doesn't find the game folder, open Settings → Tarkov
paths, fill `Game folder` with the install path, and click Save. The
watcher re-applies the new paths immediately without restart.

From a phone in LAN mode the Paths section becomes read-only with a
note to configure on the desktop — typing `D:\EFT` on an on-screen
keyboard is painful.

## Workspace layout

```
apps/
  desktop/   Tauri 2 wrapper. The single shipped .exe.
             Hosts the Rust port of the server pipeline under
             src-tauri/src/server/ (paths, config, screenshots,
             extracts) plus the IPC commands the webview calls.
  server/    LAN-only Node/Fastify backend. Fastify HTTP + WS at /ws,
             chokidar watching the screenshots folder. Only used for
             the phone/PWA scenario; not bundled into the overlay.
  client/    Vue 3 + Vite + Tailwind v4 + Leaflet + PrimeVue. Same
             code runs inside Tauri and as a plain browser PWA. The
             transport layer branches on `__TAURI_INTERNALS__` in
             window: Tauri → `invoke` + `listen`; browser → fetch + WS.
packages/
  shared/    WS payload schemas (zod) + map name table + screenshot
             filename parser. Consumed by the client and the Node
             server. The Rust port in apps/desktop redeclares the
             same shapes natively — keep them in sync by hand.
```

## Dev workflow

Two independent scenarios:

### Desktop overlay (primary)

```pwsh
# Terminal 1 — Vite dev server (provides the webview content):
pnpm --filter @tarkov-checker/client dev

# Terminal 2 — Tauri shell:
pnpm --filter @tarkov-checker/desktop tauri:dev
```

`beforeDevCommand` in `tauri.conf.json` is intentionally empty so Vite
isn't double-spawned. In dev the Rust-side server logic doesn't spawn
the watcher (`cfg!(debug_assertions)` guard) — start `apps/server`
separately if you want events flowing through during desktop dev.

### LAN / phone

```pwsh
pnpm dev    # turbo: Fastify (3000) + Vite (5173, host 0.0.0.0) in parallel
```

Open `http://localhost:5173` on desktop or `http://<lan-ip>:5173` on
the phone (Safari → Add to Home Screen for the PWA shell).

| Port | Service                       |
| ---- | ----------------------------- |
| 3000 | Fastify HTTP + WS at `/ws`    |
| 5173 | Vite dev server, host 0.0.0.0 |

## Building the overlay locally

```pwsh
pnpm overlay:build
```

Chains: shared → client (Vite build) → desktop (Tauri release build).
Output: `apps/desktop/src-tauri/target/release/tarkov-checker-desktop.exe`
(~6-8 MB, single file, no MSI/NSIS — `bundle.active: false` in
`tauri.conf.json`).

On Windows you'll likely need 5-10 retries to get a clean compile due
to MSVC/rustc CreateProcess flakiness; see [CLAUDE.md § Windows build quirks](CLAUDE.md)
for the full diagnosis story. Cargo is incremental, so each retry
resumes from the last finished crate.

If you don't want to fight the local toolchain, just push to master
or tag — see below.

## Lint / typecheck / test

```pwsh
pnpm lint
pnpm typecheck
pnpm --filter @tarkov-checker/client test
```

## Conventions

- TypeScript strict everywhere. No `any` — use `unknown` and narrow.
- ESM (`"type": "module"`) in every Node package.
- Path alias `@shared/*` → `packages/shared/src/*` (declared in
  `tsconfig.base.json` and re-declared in `apps/client/{vite,vitest}.config.ts`).
- Validate all parsed external strings (filenames, log lines, WS
  payloads, tarkov.dev responses) with the zod schemas in
  `@tarkov-checker/shared`.
- The Rust server port in `apps/desktop/src-tauri/src/server/` mirrors
  the Node server in `apps/server/src/` 1:1. **Touch one, touch the
  other** — they don't share types via codegen, parity is hand-kept.
- Server-side logs go through pino (Node) or `eprintln!` (Rust). No
  `console.log` in client code.
- Files kebab-case, Vue components PascalCase, identifiers camelCase.

## License

See [LICENSE](./LICENSE).
