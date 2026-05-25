# tarkov-checker

Live in-raid map for Escape from Tarkov. A Node backend watches the game's log
and screenshot folders and broadcasts events over WebSocket; a Vue client
renders the map with Leaflet. The same client is consumed two ways:

1. On a phone (iPod touch 7) as a PWA over LAN.
2. On the desktop as a Tauri overlay window (later: transparent + always-on-top).

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- pnpm 10+
- For `apps/desktop` only: Rust stable (via [rustup](https://rustup.rs/))
  plus Tauri 2 [system prerequisites](https://v2.tauri.app/start/prerequisites/)
  — on Windows that means the Visual Studio "Desktop development with C++"
  workload. WebView2 ships with Windows 11.

## Install

```pwsh
git clone --recurse-submodules https://github.com/Mosmain/tarkov-checker.git
# or, if already cloned:
git submodule update --init --recursive

pnpm install
```

The `--recurse-submodules` step pulls the SVG maps repo into
`apps/client/public/maps/`. See [CREDITS.md](CREDITS.md) for attribution
and licensing.

## Tarkov paths

Two paths matter:

- **Game folder** — where Tarkov is installed (e.g. `D:\EFT`). Logs are
  read from `<gameFolder>\Logs`.
- **Screenshots folder** — where the F12 overlay drops `.png` files
  (typically `<Documents>\Escape from Tarkov\Screenshots`).

Resolution priority, highest first:

1. `.env` at the repo root (Node `--env-file-if-exists`). Keys:
   `TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR`, optional `TARKOV_LOG_DIR`.
2. Manual override saved through the in-app Settings panel, persisted
   to `apps/server/data/config.json` (gitignored).
3. Auto-detect from the Windows registry: `Personal` shell folder for
   Documents (so OneDrive-redirected Documents resolves correctly) and
   `Battlestate Games\EFT\InstallLocation` for the game folder (BSG
   Launcher writes this at install time).

If auto-detect doesn't find the game folder (BSG Launcher didn't write
the registry key, or you installed manually), open the app on the
machine running Tarkov, go to Settings → Tarkov paths, fill `Game
folder` with the install path (e.g. `D:\EFT`), and click Save. The
server persists it and re-starts watchers immediately.

From a phone in the LAN the Paths section becomes read-only with a
note to configure on the desktop — typing `D:\EFT` on an on-screen
keyboard is painful.

## Workspace layout

```
apps/
  server/    Fastify + chokidar + WebSocket
  client/    Vue 3 + Vite + Tailwind v4 + Leaflet + PWA
  desktop/   Tauri 2 wrapper around apps/client
packages/
  shared/    WS payload schemas (zod) + map name table
```

## Dev workflow

```pwsh
pnpm dev          # turbo: starts server (3000) and client (5173) in parallel
```

| Port | Service                      |
| ---- | ---------------------------- |
| 3000 | Fastify HTTP + WS at `/ws`   |
| 5173 | Vite dev server (host 0.0.0) |

Open `http://localhost:5173` on desktop, or `http://<lan-ip>:5173` on the phone
(install via "Add to Home Screen" in Safari to get the PWA shell).

For the Tauri window, run **in a second terminal** (Vite must already be up):

```pwsh
pnpm --filter @tarkov-checker/desktop tauri:dev
```

## Build

```pwsh
pnpm build                                       # all packages
pnpm --filter @tarkov-checker/client build       # just the Vue bundle
pnpm --filter @tarkov-checker/desktop tauri:build  # desktop installer
```

In production, Fastify also serves the built client at `/`, so the phone only
needs port 3000.

## Lint / typecheck / test

```pwsh
pnpm lint
pnpm typecheck
pnpm --filter @tarkov-checker/client test
```

## Conventions

- TypeScript strict everywhere. No `any` — use `unknown` and narrow.
- ESM (`"type": "module"`) in every Node package.
- Path alias `@shared/*` → `packages/shared/src/*`.
- Server logs through pino; never `console.log` in committed code.
- Validate all parsed external strings (filenames, log lines, WS payloads) with
  the zod schemas in `@tarkov-checker/shared`.
- Files kebab-case, Vue components PascalCase, identifiers camelCase.

## License

See [LICENSE](./LICENSE).
