# CLAUDE.md

## What each package owns

- `apps/desktop` — Tauri 2 wrapper. Owns the production app: Rust
  in-process port of the watcher/config pipeline (under
  `src-tauri/src/server/`), plus the IPC commands the webview calls.
  This is what ships as the single 6 MB `.exe`. See "Desktop overlay's
  in-process server" below.
- `apps/server` — **LAN-only Node/Fastify backend** for the phone-as-
  second-screen scenario: serves the built SPA from `apps/client/dist/`
  via `@fastify/static`, plus `/api/config` and `/events` (SSE). Not
  bundled into the desktop overlay — the same watcher logic lives
  natively in `apps/desktop`. When changing watcher/parser/cache
  behaviour, **update both ports** or they'll drift.
- `apps/client` — Vue + Leaflet map. Runs both inside Tauri and as a
  plain browser page on a phone. `useServerTransport` and the
  `api/*.ts` files branch on `"__TAURI_INTERNALS__" in window`: Tauri
  → `invoke(...)` + `listen('position', ...)`; browser → same-origin
  `fetch('/api/*')` + `new EventSource('/events')` (Vite proxies to
  Fastify in dev; Fastify owns everything in prod).
- `packages/shared` — source of truth for the position payload shape
  (zod schemas + inferred types, consumed by client + Node server) and
  for the Tarkov map calibration table in `src/maps.ts` — keyed by raw
  in-game `nameId` (`bigmap`, `factory4_day`, `tarkovstreets`, ...) with
  per-map `displayName`, `svgFile`, `transform`, `bounds`, `rotation`,
  `floors`, and a `canonical` field that aliases like `factory4_night`
  use to resolve back to their base entry. The Rust port in
  `apps/desktop` redeclares the position payload natively — no zod-to-
  Rust bridge, just hand-kept parity on that single shape.
- `apps/client/public/maps/` — git submodule of the community SVG maps
  ([the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps),
  CC BY-NC-SA 4.0). Served as static files by Vite at `/maps/<File>.svg`.
  Don't copy SVGs out of here — keep the license isolated to the submodule.

## Dev workflow

Two independent dev scenarios:

- **Desktop overlay** (most common): one terminal — `pnpm --filter
@tarkov-checker/desktop tauri:dev`. This builds the Rust side, runs
  Vite under the hood (via `beforeDevCommand: ""` + Tauri's built-in
  devUrl wiring — wait, `beforeDevCommand` is empty, so you also need
  a Vite up). In practice: open a second terminal first and run
  `pnpm --filter @tarkov-checker/client dev`, then start Tauri.
- **LAN/phone mode**: `pnpm dev` from repo root runs `turbo run dev` —
  brings up the Node server (`:3000`) and the Vite dev server (`:5173`,
  host `0.0.0.0`) in parallel. Phone on the same LAN visits
  `http://<pc-ip>:5173`; Vite proxies `/api/*` and `/events` to the
  Fastify backend on :3000 (see `server.proxy` in `vite.config.ts`), so
  the browser only ever sees one origin. **Prod LAN mode** (no Vite):
  `pnpm build` then `pnpm --filter @tarkov-checker/server start` —
  Fastify serves the built SPA from `apps/client/dist/` plus its own
  `/api` + `/events`. Phone hits `http://<pc-ip>:3000` for both. CORS is
  not configured anywhere because there's never a cross-origin request.
  Neither flow involves the Tauri overlay.

`apps/desktop/src-tauri/tauri.conf.json` keeps `beforeDevCommand` empty
so Vite isn't double-spawned when run under Turbo.

The repo must live on an **ASCII path** (currently `C:\git-repos\tarkov-checker`)
— `cargo metadata` segfaults on a Cyrillic CWD, which is what made the
OneDrive Documents path (`C:\Users\<user>\OneDrive\Документы\...`)
unusable historically. Earlier the workaround was an NTFS junction
(`C:\tarkov-checker`); the repo now lives on a directly-ASCII path so
the junction is no longer required. See "Windows build quirks" for the
rest of the pre-requisites (HVCI off, Defender exclusions, target-dir
location).

## Path aliases

`@shared` and `@shared/*` resolve to `packages/shared/src/*`. Declared in
`tsconfig.base.json` (TS) and re-declared as regex aliases in
`apps/client/{vite,vitest}.config.ts` (Vite resolution).

## Tooling

- Vitest for tests (client only for now)
- ESLint flat config (`eslint.config.js`) + Prettier
- `no-console` is a warn; `@typescript-eslint/no-explicit-any` is an error

## UI stack

- **PrimeVue 4** with the **Aura** preset; a custom preset in
  `apps/client/src/theme.ts` overrides `semantic.primary` to map to the
  `purple` palette (via `definePreset`). All `primary-*` Tailwind utilities
  and PrimeVue components inherit this — no per-component recolouring.
- **Tailwind v4** is CSS-first via `@theme` in `styles.css` — there is **no
  `tailwind.config.ts`**. Wired through `@tailwindcss/vite` and
  `@import "tailwindcss";`. Surface tokens come from `tailwindcss-primeui`
  plugin so `bg-surface-900` etc. map to PrimeVue's surface tokens.
- **Bender** font (Free for commercial use, 1001fonts.com) lives in
  `apps/client/public/fonts/` as `.woff2` (plus original `.woff` fallback for
  400/700). `BENDER-LICENSE.txt` must stay in that folder. `@font-face` blocks
  in `styles.css` declare 8 weights (300/400/700/900 × normal/italic).
  `--font-sans` (Tailwind) and `--p-font-family` (PrimeVue) both point to
  `"Bender", system-ui, sans-serif` so the whole UI picks it up without
  per-component styling.
- **PrimeIcons** via `@import "primeicons/primeicons.css"`. Used for status
  dots (`pi-circle-fill`, `pi-check-circle`), the lock indicator, and the
  faction-coloured circles in the settings drawer.
- Dark mode key is `.dark` on `<html>` (set statically). PrimeVue's
  `darkModeSelector: ".dark"` keeps tokens dark. `data-theme` is **not** used
  — daisyUI was migrated away in favour of PrimeVue.

## Map rendering

`useLeafletMap.ts` builds a **custom CRS** extending `L.CRS.Simple` per
map: rotation is applied in `projection`, and the in-game-to-pixel
affine sits in `transformation`. The whole pipeline is a direct port of
`the-hideout/tarkov-dev`'s `src/pages/map/index.jsx` (MIT) so we can
reuse their calibration values verbatim. Concretely: a marker placed
with `L.marker([position.z, position.x])` lands at the visually correct
spot on the SVG without any per-call math.

Per-map calibration lives in `packages/shared/src/maps.ts`:

- `transform: [scaleX, offsetX, scaleY, offsetY]` — fed to
  `L.Transformation(scaleX, offsetX, -scaleY, offsetY)` (scaleY is
  negated to flip the Leaflet lat axis).
- `rotation` — degrees, applied in `projection` via
  `applyRotation(latLng, rotation)`.
- `bounds: [[x1, z1], [x2, z2]]` — in-game corner pair in the same
  shape as tarkov-dev's `maps.json`. The composable swaps the corners
  into `(lat, lng)` order before handing them to `L.latLngBounds` and
  `svgOverlay`.

The SVG is fetched at runtime from `/maps/<File>.svg` (the git submodule
under `apps/client/public/maps/`). Top-level `<g>` groups are still
collected into `loaded.floors` for the future floor switcher, but
semantics differ per map: single-level maps (Customs, Woods, Shoreline,
Lighthouse) have feature layers as top-level `<g>` (Ground, Trees,
Buildings, ...), while multi-level maps (Factory, Reserve, Interchange,
Labs) have floor groups (Basement, Ground_Floor, ...). Any floor-
switcher UI must consult a per-map allowlist of which group IDs are
"floors" — don't toggle all top-level groups blindly.

## Extracts dataset (static)

Source of truth is `apps/client/src/features/map/data/extracts/` — one JSON
file per canonical map (`bigmap.json`, `tarkovstreets.json`, ...), each a
flat array of `{key, factions[], position}` entries. Hand-curated, bundled
into the client, no runtime fetch. Vite's `import.meta.glob('./extracts/
*.json', { eager: true })` in `data/extracts.ts` indexes the files at
build time — adding a new map is just dropping a file, no manual list to
update.

Only canonical map codes get a file (the keys of `TARKOV_MAPS` with
`canonical === null`); aliases like `factory4_night` and `sandbox_high`
resolve through `canonicalMapCode()` from `@shared/maps`, so the data tree
only stores one record per logical map. Display names — both for the map
itself and for each extract — live in i18n: `mapNames.<canonicalMapCode>`
and `extractNames.<canonicalMapCode>.<key>` under
`apps/client/src/features/i18n/locales/{en,ru}.json`. The JSON files hold
no strings — adding a language is a locale-only change.

`factions` is an array because one physical exit can serve multiple sides
(PMC + Scav share the same door). At render time the client **merges
co-located extracts** that round to the same `(x, z)` bucket — Customs has
dorms V-Ex (PMC) and old road gate (Scav) ~1m apart, they become a single
composite marker. See "Map rendering layers" below for how that composite
icon (45° clip-path slices) and the multi-row tooltip (one row per
distinct name, faction-coloured stripe) are wired.

Adding a new map: drop a `<canonicalCode>.json` file (flat array of
`{key, factions[], position}`) into `data/extracts/`, add its display name
to `mapNames.<code>` and each extract's name to `extractNames.<code>.<key>`
in both locale files, and ensure the `<code>` exists in `TARKOV_MAPS` with
SVG/calibration. No script — `import.meta.glob` picks up the file at next
build.

The dataset was originally seeded from tarkov.dev's GraphQL `maps { nameId
extracts { name faction position { x y z } } }` (lang `en` + `ru`).
tarkov.dev's faction tags are known to be wrong on several maps (Streets,
Ground Zero); the per-map JSONs hold the curated truth. Keep `key` stable
when correcting names — rename the i18n string, not the JSON id.

**`@intlify/unplugin-vue-i18n` caveat:** locale JSON is pre-compiled by
the Vite plugin and does NOT re-trigger HMR when the files change on
disk. After editing `mapNames` / `extractNames` in `locales/{en,ru}.json`,
restart `vite dev` — otherwise `te()` returns false and `t()` echoes the
key back in the running app.

## Map rendering layers

`apps/client/src/features/map/` is split into two sibling folders by
ownership:

- `composables/` — **framework hooks** for Leaflet/Vue plumbing:
  `useLeafletMap`, `useMapController`, `useFloorSwitcher`,
  `usePlayerMarker`. Nothing here knows about extracts (or future quest
  markers, loot, ...) — pure map/Leaflet glue.
- `layers/<name>/` — **domain layers** rendered on top of the map. Each
  layer fully owns its concerns: data adapter, icon HTML, tooltip HTML,
  the composable that wires it into Leaflet. Today there's only one:

      layers/extracts/
        useExtractMarkers.ts    # Leaflet/Vue glue + public types
        icon.ts                 # slice geometry + makeIcon (composite via CSS clip-path)
        tooltip.ts              # buildTooltipHtml + escapeHtml + sortedEntries

  When quest markers (or anything else) get added later, mirror this
  shape: `layers/quests/{useQuestMarkers,icon,tooltip}.ts`. Don't lump
  them into `composables/`.

Extract markers are `L.divIcon` instances (not `L.icon`) — the composite
PNG split via CSS `clip-path: polygon(...)` is built inline as HTML.
Single-faction = one `<img>`; 2 or 3 factions = stacked `<img>`s with `/`-
diagonal clip slices (area-balanced thirds for the 3-faction case). The
icon reacts to the faction filter dynamically: turning Scav off on a
PMC+Scav exit re-renders the icon as a clean PMC. Tailwind's preflight
gives `<img>` `max-width: 100%` which collapses the icon to 0 inside
Leaflet's positioned wrapper, so `styles.css` keeps an override:

```
.leaflet-extracts-pane .extract-icon-divicon img {
  max-width: none !important; max-height: none !important;
}
```

Tooltip is multi-row (one row per distinct name), each row carries a
faction-coloured left stripe via `.extract-tooltip-row--{pmc|scav|shared}`
or `.extract-tooltip-row--multi` when factions share a name. `direction:
'top'` keeps the tooltip above the icon; `tooltipAnchor` inside the
icon's top edge gives a few pixels of overlap for visual cohesion.

## Tarkov path resolution

Same shape, two implementations — change one, change the other:

- **Node** (`apps/server/src/watchers/paths.ts`) — uses `reg query` +
  `chcp 65001` to decode Cyrillic Documents paths from the registry.
  Manual overrides live in `apps/server/data/config.json`. HTTP
  `GET/PUT /api/config` reads/writes them; PUT re-applies watchers
  atomically through `WatcherManager.apply()`.
- **Rust** (`apps/desktop/src-tauri/src/server/paths.rs`) — uses
  `winreg` directly (no subprocess, no codepage dance). Manual
  overrides live in `%APPDATA%/tarkov-checker/config.json`. Tauri
  commands `get_config` / `update_config` are the API; the
  `update_config` command re-runs `watcher::apply_resolved` so the
  screenshot watcher swaps to the new path without a restart.

Priority is identical in both ports: env (`TARKOV_GAME_DIR`,
`TARKOV_SCREENSHOT_DIR`) > manual override in the config file > registry
auto-detect. `logsDir` is always `gameDir + "Logs"` — no separate env or
manual override, since the BSG layout pins it there.

`SERVER_PORT` is the Fastify port (default 3000) and only applies to
`apps/server`. Deliberately distinct from `PORT` because preview/dev
tooling sometimes sets `PORT=5173` for the whole runner. Don't read
`PORT` in the Node server. The Rust port doesn't listen on any TCP
port at all.

## User settings

Persisted state lives in **per-feature** Pinia stores, not one big store:

- `apps/client/src/features/map/store.ts` — map/extract settings:
  - `mapCode` — current Tarkov map.
  - `extractFactions` — array of `"pmc" | "scav" | "shared"`.
  - `extractLabelMode` — `"hover" | "always"` (tooltip permanence).
  - `extractLabelSize` — `"sm" | "md" | "lg"` (font-size; applied via
    the `--extract-label-size` CSS variable on `<html>` from
    `useExtractMarkers.setLabelSize` — which also re-binds tooltips so
    Leaflet recomputes positions for the new height).
  - `playerFollow` — `"off" | "sm" | "md" | "lg"` — auto-recenter + zoom on
    every fresh position update. Wired in `useLeafletMap.setPlayerFollow`;
    only re-centers when `(x, z)` actually changes (skips spam updates when
    the player stands still). Zoom step: `initialZoom + FOLLOW_ZOOM_DELTA[mode]`.
  - `autoMapSwitch` — boolean, default `true`. When on, incoming
    `map-change` events from the logs watcher flip `mapCode` to whatever
    the game just loaded (resolved through `canonicalMapCode()` so
    aliases like `factory4_night` → `factory4_day` collapse). Unknown
    `rawMapId`s (a fresh BSG map we haven't added to `TARKOV_MAPS` yet)
    are silently dropped with one `console.warn`. Wiring lives in
    `features/map/composables/useAutoMapSwitch.ts`, mounted once at
    `App.vue` root.
- `apps/client/src/features/i18n/store.ts` — `apiLang` (`"en" | "ru"`).
  The store's `watch(apiLang, ..., {immediate: true})` mirrors the value
  into vue-i18n's `locale`; `main.ts` calls `useI18nStore()` eagerly after
  `app.use(createPinia())` so the persisted language is applied before any
  component reads `t()`.
- `apps/client/src/features/hotkeys/store.ts` — per-action hotkey combos.
- `apps/client/src/features/overlay/store.ts` — Tauri-only:
  `clickThrough`, `alwaysOnTop`, `opacity` (0.3–1), `zoom`
  (`"75" | "100" | "125" | "150"`).

Each store uses `persistedRef` from `@/shared/persisted-store` with its
own key (`tc.<feature>.<field>`) — corrupt persisted data falls back to
defaults silently.

Settings UI: `apps/client/src/features/settings/SettingsPanel.vue` — gear
icon in the top-right cluster next to the transport-status pill (`App.vue`),
opens a PrimeVue `Drawer` (right-side on desktop, `position="full"` on
`<640px`). Sections in order: Map / Extracts / Player / Overlay (Tauri only)
/ Hotkeys (Tauri only) — then a "СИСТЕМНЫЕ / System" divider with Language
and Tarkov paths.

Faction colours come from `FACTION_COLORS` in `packages/shared/src/maps.ts`
so icons and tooltip stripes never drift across components.

## Desktop overlay (Tauri)

The Tauri 2 window is configured as a **frameless, transparent overlay**
(`apps/desktop/src-tauri/tauri.conf.json`): `decorations: false`,
`transparent: true`, `shadow: false`, default 360×360. There is no titlebar
and no native close button — close is in the app UI, drag is via
`startDragging()`.

Frontend access to window APIs goes through `useTauriOverlay()`
(`apps/client/src/features/overlay/composables/useTauriOverlay.ts`).
Detection is `"__TAURI_INTERNALS__" in window`. In browser context every
method is a no-op so the same code path serves both.

**Overlay controls** (only rendered when `isTauri`):

- **Drag region** — the transport-status pill in `App.vue`'s top-right cluster.
  Uses an explicit `@mousedown` handler that calls `getCurrentWindow().
startDragging()` rather than `data-tauri-drag-region` attribute, which
  is flaky on `decorations: false + transparent: true` windows. Child
  `<i>` and `<span>` inside the pill have `pointer-events: none` so the
  drag start always lands on the pill itself.
- **Close** — red ✕ button next to the gear; runs through a PrimeVue
  `ConfirmDialog` so an accidental click can't kill the session (close
  sits right next to settings).
- **Lock / click-through** — bottom-right corner: a `[Ctrl][Alt][L]` Kbd
  hint plus a lock button (`pi-lock-open` ↔ `pi-lock`). State lives on
  `overlayClickThrough` in the store. Click on the open lock locks the
  window; **only the global hotkey can unlock it**, because once
  click-through is on the lock button itself isn't clickable. App.vue
  _always_ resets `overlayClickThrough` to `false` on Tauri startup —
  the locked state intentionally doesn't persist across sessions, so
  the app can't boot into an unrecoverable lockout.
- **Opacity slider** — calls `Window.setOpacity()` (Windows Layered
  Window API). If the call rejects (the permission `core:window:
allow-set-opacity` doesn't exist in Tauri 2.11.x), the composable
  silently falls back to `document.documentElement.style.opacity` so the
  slider remains visually responsive.
- **Zoom** — `WebviewWindow.setZoom(factor)`.

**Global shortcut** is `tauri-plugin-global-shortcut` (Rust crate +
`@tauri-apps/plugin-global-shortcut` npm). Registered in `App.vue`'s
`onMounted` with combo `"CommandOrControl+Alt+L"`. Handler fires on
both `Pressed` and `Released` — toggle only on `Pressed`.

**Capabilities** (`apps/desktop/src-tauri/capabilities/default.json`)
must include the privileged window ops explicitly — `core:default`
covers basics only:

```
core:window:allow-set-always-on-top
core:window:allow-set-ignore-cursor-events
core:window:allow-close
core:window:allow-start-dragging
core:webview:allow-set-webview-zoom
global-shortcut:allow-register
global-shortcut:allow-unregister
global-shortcut:allow-is-registered
```

Forgetting any of these → IPC calls reject with a permission error;
the JS side has no obvious feedback unless you check the webview console.

**Transparency** requires both:

1. `transparent: true` in tauri.conf.json
2. `html, body, #app { background: transparent; }` in styles.css (and no
   `bg-*` on `index.html`'s `<body>`)
3. `App.vue`'s root only sets `bg-surface-950` when **not** Tauri — in
   Tauri the root is transparent so the desktop shows through wherever
   nothing else paints. The Leaflet map keeps its own
   `var(--p-surface-950)` background, so the map area stays solid; only
   the strip around the map is see-through.

## Desktop overlay's in-process server

Lives under `apps/desktop/src-tauri/src/server/`. Mirrors the Node
modules in `apps/server/src/` 1:1 so cross-checking stays cheap:

| Node (LAN backend)                  | Rust (in-process)                           | Purpose                                                                                          |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `watchers/screenshots.ts`           | `server/screenshots.rs`                     | chokidar `awaitWriteFinish` → `notify-debouncer-full` 250 ms                                     |
| `watchers/logs.ts`                  | `server/logs.rs`                            | tail `* application_NNN.log` in latest `log_*/`; emit `map-change` on `rcid:` / `Location:` hits |
| `watchers/paths.ts` + `registry.ts` | `server/paths.rs`                           | `reg query` subprocess → `winreg` direct                                                         |
| `config-store.ts`                   | `server/config.rs`                          | JSON in `apps/server/data/` → `%APPDATA%/tarkov-checker/`                                        |
| `sse.ts` Hub broadcast              | `app.emit("position" \| "map-change", ...)` | SSE fan-out → Tauri event                                                                        |
| `GET/PUT /api/config`               | `commands::{get_config, update_config}`     | HTTP routes → IPC commands                                                                       |

Frontend doesn't know which backend it talks to. Switch is in two
places only:

- `apps/client/src/features/server/composables/useServerTransport.ts` —
  Tauri: `listen('position', ...)` + status hard-coded to `"open"`.
  Browser: delegates to the `useServerStream` composable (SSE /
  `EventSource`, which auto-reconnects).
- `apps/client/src/features/server/api/transport.ts` — single dispatch
  for HTTP/IPC calls. Tauri: dynamic import of `@tauri-apps/api/core` +
  `invoke(...)`. Browser: same-origin `fetch` (Vite proxy → Fastify in
  dev; Fastify direct in prod).

The Rust crate has no HTTP client — `reqwest` was removed along with the
old `get_extracts` command, since the extracts dataset is now bundled
into the SPA. The Rust port only watches the filesystem and writes
config; nothing reaches out to the network.

`PositionPayload` (struct in `screenshots.rs`) and `MapChangePayload`
(struct in `logs.rs`) on the Rust side mirror `PositionMessage` and
`MapChangeMessage` from `packages/shared/src/ws-messages.ts`. Adding a
new event type means touching all four declarations (TS schema + TS
discriminated union + Rust payload + Tauri `listen()` call in
`useServerTransport.ts`); the file is still called `ws-messages.ts` for
historical reasons (was the WS schema before the SSE migration).

The logs watcher (`logs.ts` / `logs.rs`) tails the **latest** `log_*/`
session folder under `logsDir` — picked by sort order (timestamps in the
folder name). On startup it scans the tail of the active
`application_NNN.log` (~64 KB window) for the most recent map-load line
and emits one seed `map-change` so the overlay snaps to whatever map
Tarkov is currently in (mid-raid or post-extract). After that it tails
from EOF, watches for new `log_*/` folders (next game launch) and for
higher-suffix `application_NNN.log` rotations within the active folder.
The parser regex lives once in `@shared/parse-log.ts` (Node) and is
mirrored literally in `server/logs.rs` (Rust) — `SCENE_PRESET_RE` +
`TRANSIT_LOCATION_RE` + `TRACE_LOCATION_RE` — keep them in sync. The
parser **lowercases its capture group** before returning, so callers
have a stable key regardless of which line shape produced the hit. Same
map, three case conventions observed live on 2026-05-30 in patch
1.0.5.0:

| Line shape                     | Sample id                                       | Note                                                                                     |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `rcid:<id>.scenespreset.asset` | `factory_day` / `city` / `Rezerv_Base`          | primary, fires ~30s before raid; case varies per map                                     |
| `[Transit] Locations:<id>`     | `factory4_day` / `TarkovStreets` / `RezervBase` | canonical legacy id, fires after `LocationLoaded`                                        |
| `Location: <id>, Sid:` (TRACE) | `bigmap`                                        | pre-1.0.5.0 only; line removed in 1.0.5.0 but pattern stays for historical session reads |

Patch 1.0.5.0 also **renamed several scene-preset bundles** (BSG dropped
the legacy "Factory 4" numbering and the `tarkov` prefix on Streets,
swapped Reserve's `rezervbase` for `Rezerv_Base`). The `[Transit]`
`Locations:` field still emits the canonical legacy id, so the parser's
secondary pattern works as a no-alias fallback. The primary `rcid:` path
is faster but needs alias maintenance: `TARKOV_MAPS` carries
`factory_day` / `factory_night` / `city` / `rezerv_base` alias entries
pointing back to their canonical via the same `canonical:` field already
used for `factory4_night` and `sandbox_high`. Adding a future rename =
one new alias entry + one new test case in `parse-log.spec.ts`.

`bundle.active: false` in `tauri.conf.json` — overlay:build skips MSI
and NSIS, just produces the bare `.exe` at
`apps/desktop/src-tauri/target/release/tarkov-checker-desktop.exe`.
Flip to `true` (with `bundle.targets: ["msi","nsis"]` or `"all"`) when
a release flow needs installers.

## Windows build quirks

The repo's location and Windows 11 defaults create several footguns. They
all surface as the same symptom — `STATUS_ACCESS_VIOLATION (0xc0000005)`
or `os error 5` in rustc / build scripts — so they're easy to confuse.
Fixing each one separately got the Tauri build green:

1. **HVCI / Memory Integrity must be OFF.** Windows 11's Core Isolation
   (`Settings → Privacy & security → Windows Security → Device security →
Core isolation`) crashes rustc on heavy crates (random `0xc0000005`
   in different crates each run, often as deep as ~250/355). Disable
   "Memory integrity", reboot. Verify with:
   `(Get-CimInstance Win32_DeviceGuard -Namespace 'root\Microsoft\Windows\
DeviceGuard').SecurityServicesRunning` → should be empty/`0`. VBS
   itself can stay running (LSA protection uses it).

2. **Defender re-enables itself after reboot.** Manually toggling
   Windows Defender off does **not** persist. Use permanent exclusions
   (admin PowerShell):

   ```
   Add-MpPreference -ExclusionPath 'C:\Users\<u>\.cargo'
   Add-MpPreference -ExclusionPath 'C:\Users\<u>\.rustup'
   Add-MpPreference -ExclusionPath 'C:\git-repos'
   Add-MpPreference -ExclusionProcess 'rustc.exe'
   Add-MpPreference -ExclusionProcess 'cargo.exe'
   Add-MpPreference -ExclusionProcess 'link.exe'
   ```

3. **Cargo target dir is the default `target/` inside `apps/desktop/src-tauri/`**.
   Earlier the project pinned it to `C:/tarkov-checker-target` via
   `.cargo/config.toml` to dodge OneDrive racing on writes; now that
   the repo lives off OneDrive, the default location works and you
   don't have to remember a separate path. The `C:\git-repos` Defender
   exclusion above covers it. If you have a stale `C:\tarkov-checker-target/`
   from the old layout, it's safe to delete (saves a few GB).

4. **The repo must live on an ASCII path.** `cargo metadata` segfaults
   on a Cyrillic CWD (which is what made the OneDrive Documents path —
   `C:\Users\<u>\OneDrive\Документы\...` — unusable). Current location
   is `C:\git-repos\tarkov-checker`. If you ever clone fresh into a
   Cyrillic path, either move it or `mklink /J` an ASCII alias and run
   pnpm from there. The legacy junction `C:\tarkov-checker` is no
   longer required and can be removed with `rmdir C:\tarkov-checker`.

5. **`Cargo.toml` needs explicit `[[bin]]` + `default-run`.** Without
   them tauri-cli panics at `tauri-cli/src/interface/rust.rs:1149`
   (`unwrap()` on None) before any compilation starts. The current
   manifest has both.

6. **Process-spawn flakiness during the Rust build.** Rustc, the MSVC
   linker (`link.exe`), `cl.exe` (cc-rs for native crates), and build
   scripts (`embed-resource`, `ring`, `httparse`, ...) intermittently
   fail to spawn with `Os { code: 5, kind: PermissionDenied }` ("Отказано
   в доступе") or crash partway with `STATUS_ACCESS_VIOLATION
(0xc0000005)`. Different crate each run, no consistent culprit.
   Cargo is incremental — each retry resumes from the last finished
   crate. Plan for 5–10 retries on a fresh release build, fewer on
   incremental ones. Most likely cause is Smart App Control or Tamper
   Protection silently interfering with CreateProcess; HVCI being off
   and Defender exclusions being in place is not enough.

7. **Icons must exist for `tauri-build` on Windows.** At minimum
   `apps/desktop/src-tauri/icons/icon.ico` must be present (the Windows
   Resource step depends on it). Placeholder PNGs at 32×32, 128×128,
   128×128@2x are also referenced in `tauri.conf.json` and ship today
   as solid purple squares — replace before any release.

## CI & releases

Single workflow at `.github/workflows/build-overlay.yml`, runs on
`windows-latest`. Three triggers, three distinct behaviours:

| Trigger             | CI runs | Artifact (30 d) | GitHub Release |
| ------------------- | :-----: | :-------------: | :------------: |
| `workflow_dispatch` |   ✅    |       ✅        |       ❌       |
| `push` to `master`  |   ✅    |       ✅        |       ❌       |
| `push` of `v*` tag  |   ✅    |       ✅        |       ✅       |

Master pushes are CI-gate-only on purpose — not every merge is a
release, and auto-publishing would spam the Releases tab.

Cutting a release (maintainer-only):

```pwsh
git tag -a v0.1.0 -m "First public build"
git push origin v0.1.0
```

Pushing the tag triggers a fresh CI run from the tagged commit
(~3-5 min warm cache, ~8-12 cold). On success `softprops/action-gh-release@v2`
publishes a GitHub Release named `v0.1.0` with `tarkov-checker-desktop.exe`
attached and marked as **Latest**. End users grab it from the Releases
tab; the .exe lives there indefinitely.

Workflow artifacts (the 30-day ones on the run page) and the rust-cache
are unrelated to the Releases storage — see the "Что может произойти с
тайм-аутами" discussion if the two ever get conflated.

`pnpm/action-setup@v4` reads the pnpm version from `packageManager`
in root `package.json`. Don't also pass `version:` in the action input
— v4 errors out on the conflict (`ERR_PNPM_BAD_PM_VERSION`).

Trying to fix flaky local builds via Smart App Control / Tamper
Protection / Defender exclusions / HVCI off / VBS-disable etc. has
been exhausted previously — the local-build path on this machine
genuinely requires retries even with everything documented in
"Windows build quirks" applied. CI sidesteps all of it. **If you find
yourself debugging local rustc crashes again, push a tag instead.**

## Other environment quirks

- Bash on Windows (msys2 inside Git for Windows) occasionally fails to
  spawn child processes with `STATUS_ACCESS_VIOLATION`. The exception is
  msys2-side, not the tool's fault — invoke via PowerShell when
  reproducibility matters. `2>&1` in PowerShell with native commands
  wraps stderr as ErrorRecord and trips `$?` even on success; use the
  default stream behaviour and let PS capture both streams to file.
