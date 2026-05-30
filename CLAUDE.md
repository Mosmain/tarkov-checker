# CLAUDE.md

## What each package owns

- `apps/desktop` — Tauri 2 wrapper. The production artifact: Rust
  watcher/config pipeline (`src-tauri/src/server/`), the Tauri IPC
  commands the webview calls, AND an in-process HTTP server (axum) on
  `127.0.0.1:47474` exposing `/api/ping`, `/api/config` (GET+PUT) and
  `/events` (SSE). Single 6 MB `.exe` that ships as both the overlay
  and the local HTTP backend for any browser pointed at the same
  origin. See "In-process HTTP server" below.
- `apps/client` — Vue + Leaflet map. Two transports, one codebase.
  Inside the Tauri webview: `invoke(...)` + `listen('position', ...)`.
  Inside any other browser tab (hosted-frontend future or LAN-phone):
  same-origin `fetch('/api/*')` + `new EventSource('/events')`, where
  the helper's HTTP server is the actual target. The transport split
  lives in `useServerTransport` / `api/transport.ts`, both branching on
  `"__TAURI_INTERNALS__" in window`.
- `packages/shared` — source of truth for the position payload shape
  (zod schemas + inferred types, consumed by the client) and for the
  Tarkov map calibration table in `src/maps.ts` — keyed by raw in-game
  `nameId` (`bigmap`, `factory4_day`, `tarkovstreets`, ...) with per-map
  `displayName`, `svgFile`, `transform`, `bounds`, `rotation`, `floors`,
  and a `canonical` field that aliases like `factory4_night` use to
  resolve back to their base entry. The Rust side mirrors the position
  payload via a JSON-fixture-driven test, not a zod-to-Rust bridge —
  see "Cross-port parsers" below.
- `apps/client/public/maps/` — git submodule of the community SVG maps
  ([the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps),
  CC BY-NC-SA 4.0). Served as static files by Vite at `/maps/<File>.svg`.
  Don't copy SVGs out of here — keep the license isolated to the submodule.

## Dev workflow

One scenario, two processes:

- **Vite dev server**: `pnpm --filter @tarkov-checker/client dev`
  serves the SPA at `http://localhost:5173`. Its `server.proxy` config
  forwards same-origin `/api/*` and `/events` to the Rust helper at
  `127.0.0.1:47474`, so the browser only ever sees one origin and CORS
  stays simple.
- **Tauri overlay**: `pnpm --filter @tarkov-checker/desktop tauri:dev`
  builds the Rust side and loads `http://localhost:5173` into a
  WebView2 window. The Rust process is also the HTTP server backing
  the Vite proxy — both transports talk to the same in-process state.

Order matters: start Vite first (Tauri's `beforeDevCommand` is empty),
then `tauri:dev`. The Rust HTTP server binds on `127.0.0.1` only by
default; LAN exposure for the phone-as-second-screen scenario is a
future opt-in toggle (see "Future architecture").

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
  `useLeafletMap`, `useFloorSwitcher`. Nothing here knows about extracts,
  player markers, or future quest markers — pure map/Leaflet glue.
- `layers/<name>/` — **domain layers** rendered on top of the map. Each
  layer fully owns its concerns: data adapter, icon HTML, tooltip HTML,
  the composable that wires it into Leaflet. All layers use a registry
  pattern: `layers/registry.ts` exports `registerMapLayer()` and
  `useMapLayers()`. Currently:

      layers/extracts/
        useExtractsLayer.ts     # Leaflet/Vue glue, data load, marker sync
        icon.ts                 # slice geometry + makeIcon (composite via CSS clip-path)
        tooltip.ts              # buildTooltipHtml + escapeHtml + sortedEntries
        index.ts                # registerMapLayer call
      layers/player/
        usePlayerLayer.ts       # player position marker + follow logic
        index.ts                # registerMapLayer call
      layers/airdrop/
        useAirdropLayer.ts      # purple uncertainty circle around the predicted drop
        index.ts                # registerMapLayer call

  Each `index.ts` calls `registerMapLayer({ id, mount })` at module load;
  `main.ts` loads all index files via `import.meta.glob('@/features/map/layers/*/index.ts', { eager: true })`.
  `MapView.vue` reads the registry with `useMapLayers()` and calls
  `mount(ctx)` for each layer in setup(). When quest markers (or anything
  else) get added later, create `layers/quests/{useQuestMarkers,icon,tooltip,index}.ts`
  following the same pattern — no manual list to update. Airdrop's state
  machine, tracker, and banner live in `features/airdrop/` — only the
  Leaflet circle moved here. See "Airdrop feature" below.

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

**Player marker** (`layers/player/usePlayerLayer.ts`) subscribes to
`useServerEvent('position', ...)` directly and renders one `L.divIcon`
marker — an SVG arrow (rotated by `yaw + mapRotation + yawOffset`) or
a circle fallback when `yaw === null`. The marker isn't created until
the first position arrives. On every position update with changed
`(x, z, yaw)` and `playerFollow !== 'off'`, the map recenters and zooms
to `initialZoom + FOLLOW_ZOOM_DELTA[mode]` — that's why `initialZoom`
sits in `MapLayerContext`.

## Airdrop feature

Two-shot airdrop triangulation. The player snaps a screenshot while the
crate is still in the air ("ranging shot"), then a second one a moment
later from the same position — the system reads the two screenshot
filenames, runs `triangulateDropPoint` from `@shared/triangulate`, and
renders the predicted touchdown as a purple uncertainty circle whose
radius is configurable in Settings. Ownership splits deliberately
across two folders:

- `features/airdrop/` — state machine (`store.ts`), screenshot-event
  tracker (`composables/useAirdropTracker.ts`), banner UI
  (`components/AirdropStatusBanner.vue`), and the Settings section. No
  Leaflet imports anywhere under this folder.
- `features/map/layers/airdrop/useAirdropLayer.ts` — the `L.circle`
  that renders the predicted drop area, mirroring the
  `layers/extracts/` convention. Subscribes to the store's `phase`,
  `outcome`, and `dropMarkerRadius` and reconciles the circle on every
  change. Mounted from `MapView.vue` alongside extracts.

Math lives in `@shared/triangulate` (pure function, fully tested in
`src/__tests__/triangulate.spec.ts`). The position payload feed comes
from the same `useServerEvent('position', ...)` bus the rest of the
map uses — no separate transport, no separate dataset.

## Tarkov path resolution

`apps/desktop/src-tauri/src/server/paths.rs` reads the registry via
`winreg`, looks at env vars, applies manual overrides from
`%APPDATA%/tarkov-checker/config.json`, and returns the resolved triple
(`gameDir`, `logsDir`, `screenshotsDir`) with `source` + `exists` flags.

Priority: env (`TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR`) > manual
override in the config file > registry auto-detect. `logsDir` is always
`gameDir + "Logs"` — no separate env or manual override, since the BSG
layout pins it there.

Two surfaces read/write this state:

- **Tauri IPC**: `get_config` / `update_config` commands. The webview
  uses these via `invoke()`. `update_config` re-runs
  `watcher::apply_resolved` so the screenshot watcher swaps to the new
  path without a restart.
- **HTTP**: `GET /api/config` / `PUT /api/config` on the in-process
  axum server (see "In-process HTTP server" below). Same behaviour as
  the IPC commands, same `ResolvedPaths` shape.

The HTTP server binds on `127.0.0.1:47474` — fixed port, no TCP
exposure beyond loopback. LAN exposure is a future opt-in toggle
(see "Future architecture").

## User settings

Persisted state lives in **per-feature** Pinia stores, not one big store:

- `apps/client/src/features/map/store.ts` — map/extract settings:
  - `mapCode` — current Tarkov map.
  - `extractFactions` — array of `"pmc" | "scav" | "shared"`.
  - `extractLabelMode` — `"hover" | "always"` (tooltip permanence).
  - `extractLabelSize` — `"sm" | "md" | "lg"` (font-size; applied via
    the `--extract-label-size` CSS variable on `<html>` from
    `useExtractsLayer` in `layers/extracts/useExtractsLayer.ts` — which also
    re-binds tooltips so Leaflet recomputes positions for the new height).
  - `playerFollow` — `"off" | "sm" | "md" | "lg"` — auto-recenter + zoom on
    every fresh position update. Wired in `layers/player/usePlayerLayer.ts`;
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
  `alwaysOnTop`, `opacity` (0.3–1), `mapOpacity` (0–1), `zoom`
  (`"75" | "100" | "125" | "150"`), plus a deliberately session-only
  `clickThrough` (plain `ref()`, not `persistedRef` — see note below).
- `apps/client/src/features/airdrop/store.ts` — `dropMarkerRadius` (game
  meters, slider-bound in Settings). Wraps the airdrop state machine —
  `phase` and `outcome` are derived runtime state, not persisted.

Each store uses `persistedRef` from `@/shared/persisted-store` with its
own key (`tc.<feature>.<field>`) — corrupt persisted data falls back to
defaults silently.

**Session-only state.** `overlayClickThrough` intentionally does NOT
use `persistedRef`. Booting into a locked overlay with a broken hotkey
would be unrecoverable, so `App.vue` resets the value to `false` on
every Tauri startup. Reach for plain `ref()` (not `persistedRef`) any
time boot-time recoverability matters more than user-visible
continuity; default to `persistedRef` everywhere else.

## Settings UI registry

Settings sections use a registry pattern similar to map layers: each feature
that owns settings registers its UI section via `registerSettingsSection()`.

- `features/settings/registry.ts` — `registerSettingsSection()` and
  `useSettingsSections(group)`. Visibility logic: `'always'` (desktop +
  phone, default), `'tauri'` (overlay only), `'desktop-or-tauri'` (phone at
  ≥640px or overlay). Order uses multiples of 10. Currently:
  - main: 10 map, 20 extracts, 30 player, 40 airdrop (tauri-only), 50 overlay (tauri-only), 60 hotkeys (tauri-only)
  - system: 10 language, 20 paths (desktop-or-tauri)
- `features/<name>/settings.ts` — each feature with settings calls
  `registerSettingsSection({ id, group, order, visible, component })` at
  module load. Currently: `map`, `airdrop`, `overlay`, `hotkeys`, `i18n`,
  `server` (each maps to a section component under
  `features/settings/sections/`).
- `main.ts` loads all registration files via
  `import.meta.glob('@/features/*/settings.ts', { eager: true })`.
- `SettingsPanel.vue` — gear icon in the top-right cluster next to the
  transport-status pill (`App.vue`), opens a PrimeVue `Drawer` (right-side on
  desktop, `position="full"` on `<640px`). Iterates `useSettingsSections('main')`
  and `useSettingsSections('system')` to build the drawer — no hard-coded list
  of sections.

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
Detection is the `isTauri` const exported from
`apps/client/src/shared/tauri.ts` (`typeof window !== 'undefined' &&
'__TAURI_INTERNALS__' in window`) — one source of truth, imported by
the transport layer, the router, and the overlay composable so the
SSR-safety guard never drifts. In browser context every overlay method
is a no-op so the same code path serves both.

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

## In-process HTTP server

Lives under `apps/desktop/src-tauri/src/`. The Rust crate hosts an
axum-based HTTP server alongside the Tauri IPC layer, so the same
process backs both the webview (via IPC) and any browser tab on the
machine (via HTTP). One source of state, two transports.

| Module                          | Role                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `http_server.rs`                | axum routes, CorsLayer, SSE handler, listens on `127.0.0.1:47474`                     |
| `server/screenshots.rs`         | `notify-debouncer-full` watcher (250 ms `awaitWriteFinish` equivalent); parses filename → position |
| `server/logs.rs`                | poll-tails latest `log_*/application_NNN.log`; emits `map-change` on `rcid:` / `Location:` hits     |
| `server/paths.rs`               | env → manual override → `winreg` auto-detect; returns `ResolvedPaths`                 |
| `server/config.rs`              | reads/writes `%APPDATA%/tarkov-checker/config.json`; rejects UNC paths                |
| `server/events.rs`              | `ServerEvent` enum + `tokio::sync::broadcast` channel for HTTP-side fan-out           |
| `watcher.rs`                    | `WatcherSlot` state holder + `apply_resolved` that atomically swaps watcher handles   |
| `auth.rs`                       | bearer-token storage in Windows Credential Manager (dormant; LAN-mode wiring later)   |
| `commands.rs`                   | Tauri `#[tauri::command]` adapters mirroring the HTTP routes                          |

**HTTP routes** (all under `127.0.0.1:47474`):

- `GET /api/ping` — public health probe (`{name, version, status}`).
- `GET /api/config` — current `ResolvedPaths`. Origin-allowlisted via
  `CorsLayer` (`http://localhost:5173` + future hosted-frontend
  origin); same JSON shape as the Tauri `get_config` IPC command.
- `PUT /api/config` — apply `ConfigPatch`, re-run `apply_resolved`,
  return the new `ResolvedPaths`. UNC → 400 with `{error: "..."}`.
- `GET /events` — Server-Sent Events stream. `ServerEvent` (tagged
  enum) frames; one `data: { type: "position"|"map-change", ... }`
  per watcher emission. Keep-alive `: ping` every 25 s.

Events are fan-out twice in parallel by each watcher emit-site:

```
filesystem change
  ├─→ app.emit("position", ...)         // Tauri webview gets it via listen()
  └─→ event_tx.send(ServerEvent::...)   // HTTP /events subscribers get it
```

Frontend chooses the transport in two places only:

- `apps/client/src/features/server/composables/useServerTransport.ts` —
  Tauri: `listen('position', ...)` + status hard-coded to `"open"`.
  Browser: delegates to `useServerStream` (`EventSource('/events')`
  with auto-reconnect).
- `apps/client/src/features/server/api/transport.ts` — single dispatch
  for HTTP/IPC calls. Tauri: dynamic import of `@tauri-apps/api/core`
  + `invoke(...)`. Browser: same-origin `fetch('/api/*')` (Vite proxy
  in dev; direct on `127.0.0.1:47474` in the future hosted-frontend
  scenario where `https://<your-domain>` page hits localhost across
  origins, allowed by the browser localhost-exception in the Secure
  Contexts spec).

`PositionPayload` (struct in `screenshots.rs`) and `MapChangePayload`
(struct in `logs.rs`) on the Rust side mirror `PositionMessage` and
`MapChangeMessage` from `packages/shared/src/ws-messages.ts`. The
HTTP-side `ServerEvent` enum (in `server/events.rs`) is the tagged-
union wire format for SSE. Adding a new event type touches four
declarations (TS schema, TS discriminated union, Rust payload struct,
new `ServerEvent` variant); the file is still called `ws-messages.ts`
for historical reasons (was the WS schema before the SSE migration).

The logs watcher (`server/logs.rs`) tails the **latest** `log_*/`
session folder under `logsDir` — picked by sort order (timestamps in
the folder name). On startup it scans the tail of the active
`application_NNN.log` (~64 KB window) for the most recent map-load
line and emits one seed `map-change` so the overlay snaps to whatever
map Tarkov is currently in (mid-raid or post-extract). After that it
tails from EOF, watches for new `log_*/` folders (next game launch)
and for higher-suffix `application_NNN.log` rotations within the
active folder. The parser regex lives once in `@shared/parse-log.ts`
and is generated into `server/parse_log_regexes.rs` by
`packages/shared/scripts/gen-rust-regex.mjs` (run via
`pnpm shared:gen-rust-regex`). Both ports use the same regex strings;
forget to regenerate and the `rust-regex-sync` CI job turns red. The
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
