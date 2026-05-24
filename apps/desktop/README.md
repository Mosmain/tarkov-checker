# @tarkov-checker/desktop

Tauri 2 wrapper around `@tarkov-checker/client`. The window embeds the built
Vue bundle from `apps/client/dist`; in dev it points at the running Vite
server (`http://localhost:5173`).

## Requirements

- Rust (stable) — install via https://rustup.rs/
- Tauri 2 system prerequisites — https://v2.tauri.app/start/prerequisites/

## Dev

```pwsh
# Terminal 1 — start the Vite dev server (from repo root)
pnpm dev

# Terminal 2 — launch the Tauri window
pnpm --filter @tarkov-checker/desktop tauri:dev
```

`beforeDevCommand` is intentionally empty in `tauri.conf.json` so the
Vite server stays under Turbo's orchestration and isn't double-spawned.

## Production build

```pwsh
pnpm --filter @tarkov-checker/desktop tauri:build
```

`beforeBuildCommand` builds the client first; Tauri then bundles
`apps/client/dist` into the installer.

## Out of scope (this bootstrap)

Transparency, always-on-top, click-through, tray icon, custom commands.
These land in a later session.
