# CLAUDE.md

## What each package owns

- `apps/desktop` — Tauri 2 wrapper. The production artifact: Rust
  watcher/config pipeline (`src-tauri/src/server/`), the Tauri IPC
  commands the webview calls, AND an in-process HTTP server (axum) on
  `0.0.0.0:47474` (binds all interfaces, trust model: same Wi-Fi = trusted)
  exposing `/api/ping`, `/api/config` (GET+PUT), `/api/hotkeys` (GET+PUT,
  +suspend/resume) and `/events` (SSE). Single 6 MB `.exe` that ships as both
  the overlay and the local HTTP backend for any browser pointed at the same
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

One command:

```
pnpm --filter @tarkov-checker/desktop tauri:dev
```

`beforeDevCommand` spawns `pnpm --filter @tarkov-checker/client dev`
(Vite on **:5173**). Tauri waits for it, opens the webview at the same
URL, and shuts Vite down when it exits. The Rust helper (in-process
HTTP server) binds `0.0.0.0:47474` for `/api/*` and `/events`; Vite's
`server.proxy` forwards same-origin requests to it.

In **dev** the helper does NOT serve the SPA (no embedded `dist/`) —
hitting `http://localhost:47474/` returns a stub message pointing at
Vite. Phones in the same Wi-Fi use `http://<lan-ip>:5173/`. The
embedded-SPA path lights up only in **release** builds, where there
is no Vite.

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

`apps/client/src/features/map/` is split into three sibling folders:

- `composables/` — **framework hooks** for Leaflet/Vue plumbing:
  `useLeafletMap`, `useFloorSwitcher`, `useLayerVisibility`, `useRailObstacle`
  (the rail rect edge-indicator layers wrap around). Nothing here knows about
  extracts, player markers, or future quest markers — pure map/Leaflet glue.
- `components/` — **UI surfaces** mounted by the page:
  - `LayerRail.vue` — on-map left rail (vertically centered). Top icon = base map
    selector flyout (MapSection component). Below that, one icon per layer **category**
    (derived from registry `subgroup`: today only `player`, with `loot`/`quests`
    dimmed future icons). Clicking a category icon opens a flyout listing its
    layers: each row has a visibility `ToggleSwitch`, layer name, and a gear button
    that expands that layer's settings component inline. Floor stepper at the rail's
    bottom (multi-floor maps only) is a vertical ▲/level/▼. Rail hides when the
    overlay is click-through-locked. When locked on a multi-floor map, a compact
    read-only floor chip appears bottom-left. Flyouts position relative to the rail
    via CSS `position: absolute; left: full; top: 1/2` (NOT `position: fixed`
    which drifted in the Tauri WebView2 overlay).
  - `MapView.vue` — mounts the Leaflet container, the LayerRail, and layer
    composables. Wires Alt+mouse wheel (captured, throttled ~120ms) to step
    floors instead of zooming on multi-floor maps.
- `layers/<name>/` — **domain layers** rendered on top of the map. Each layer fully
  owns its concerns: data adapter, icon HTML, tooltip HTML, the composable that
  wires it into Leaflet. All layers use a registry pattern: `layers/registry.ts`
  exports `registerMapLayer()` and `useMapLayers()`. Currently:

      layers/extracts/
        useExtractsLayer.ts     # Leaflet/Vue glue, data load, marker sync
        icon.ts                 # slice geometry + makeIcon (composite via CSS clip-path)
        tooltip.ts              # buildTooltipHtml + escapeHtml + sortedEntries
        useEdgeIndicators.ts    # off-screen extract arrows; wraps left edge around the rail
        index.ts                # registerMapLayer call
      layers/player/
        usePlayerLayer.ts       # player position marker + recentering on follow
        index.ts                # registerMapLayer call
      layers/airdrop/
        useAirdropLayer.ts      # purple uncertainty circle around the predicted drop
        index.ts                # registerMapLayer call

  Each `index.ts` calls `registerMapLayer({ id, mount, category, order, titleKey,
  settingsComponent? })` at module load (the rail metadata lives here — there is
  no second registry for layers);
  `main.ts` loads all index files via `import.meta.glob('@/features/map/layers/*/index.ts', { eager: true })`.
  `MapView.vue` reads the registry with `useMapLayers()` and calls
  `mount(ctx)` for each layer in setup(). `MapLayerContext` (in `layers/registry.ts`)
  includes `visible: Ref<boolean>` driven by the LayerRail toggle; the layer composable
  watches it and adds/removes its Leaflet root accordingly. When quest markers (or
  anything else) get added later, create `layers/quests/{useQuestMarkers,icon,tooltip,index}.ts`
  following the same pattern — no manual list to update. Airdrop's state machine,
  tracker, and banner live in `features/airdrop/` — only the Leaflet circle moved here.
  See "Airdrop feature" below.

**Off-screen extract arrows** (`useEdgeIndicators.ts`): arrows render on the viewport
edge pointing at extracts outside the visible bounds. On the overlay, the left edge
wraps around the LayerRail — a left-edge arrow whose y falls within the rail's
vertical span is pushed out to the rail's right edge (RAIL_GAP px beyond). Measured
each frame via `.layer-rail` rect so arrows flow dynamically as the rail animates
in/out on lock transitions.

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
`(x, z)` and `playerFollow === 'on'`, the map recenters (zoom stays
fixed) — that's why `initialZoom` sits in `MapLayerContext`.

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
  the IPC commands, same `ConfigResponse` shape.

The config get/update no longer returns bare `ResolvedPaths` — it returns
`ConfigResponse` (`paths.rs`), which `#[serde(flatten)]`s `ResolvedPaths` and
appends `deleteScreenshots: bool`. Wire shape is
`{ gameDir, logsDir, screenshotsDir, deleteScreenshots }`, mirrored by
`serverConfigResponseSchema` in `@shared/config-api`. `deleteScreenshots` is an
opt-in (default false) flag persisted in `config.json` alongside the path
overrides: when on, the screenshot watcher sends each parsed Tarkov screenshot
to the **OS recycle bin** (`trash` crate) right after broadcasting its
position — the image is never used beyond its filename, so nothing is lost, and
the folder stops filling up over long sessions. Only files whose name parses as
a Tarkov position screenshot are touched (`should_trash` in `screenshots.rs`);
unrelated files the user dropped in the folder are never deleted. The flag
reaches the watcher via a shared `Arc<AtomicBool>` on `WatcherSlot`
(`set_delete_screenshots`), so toggling it takes effect live; both PUT paths
(`update_config` IPC + `put_config_http`) set it before `apply_resolved`. UI is
a `ToggleSwitch` in the Paths settings section (saves immediately, no Save
button), so it's configured on the machine that owns the screenshots folder.

The HTTP server binds on `0.0.0.0:47474` — all interfaces, fixed port. Same-Wi-Fi
machine browsers reach it via localhost/127.0.0.1 loopback; LAN phones reach it
via the LAN IP. Trust model: same Wi-Fi = trusted (gated by `CorsLayer` for
browser drive-by callers; LAN curl-equivalents unfiltered by design). See
"In-process HTTP server" section for architectural reasoning.

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
  - `edgeIndicators` — boolean, default false. Off-screen extract arrows; opt-in.
  - `playerFollow` — `"off" | "on"` — auto-recenter map on every fresh position
    update. Wired in `layers/player/usePlayerLayer.ts`; only recenters when
    `(x, z)` actually changes (skips spam updates when the player stands still).
    Zoom stays fixed at `initialZoom`.
  - `autoMapSwitch` — boolean, default `true`. When on, incoming
    `map-change` events from the logs watcher flip `mapCode` to whatever
    the game just loaded (resolved through `canonicalMapCode()` so
    aliases like `factory4_night` → `factory4_day` collapse). Unknown
    `rawMapId`s (a fresh BSG map we haven't added to `TARKOV_MAPS` yet)
    are silently dropped with one `console.warn`. Wiring lives in
    `features/map/composables/useAutoMapSwitch.ts`, mounted once at
    `App.vue` root.
- **Per-layer visibility**: `composables/useLayerVisibility.ts` exports a
  function that returns a shared `persistedRef('tc.layer.<id>.visible', z.boolean(), true)`
  per layer id (module-level singleton). The LayerRail toggle and the layer
  composable read/write the same ref. Consumed by `MapLayerContext.visible`
  in `layers/registry.ts`.
- `apps/client/src/features/i18n/store.ts` — `apiLang` (`"en" | "ru"`).
  The store's `watch(apiLang, ..., {immediate: true})` mirrors the value
  into vue-i18n's `locale`; `main.ts` calls `useI18nStore()` eagerly after
  `app.use(createPinia())` so the persisted language is applied before any
  component reads `t()`.
- `apps/client/src/features/hotkeys/store.ts` — thin sync layer over the
  **backend-owned** combos: `lockHotkey` stays a client `persistedRef`
  (overlay-only), the five forwarded actions load from the backend
  (`fetchHotkeys`) and `setAction` PUTs on change. See "Backend-owned
  hotkeys" below.
- `apps/client/src/features/overlay/store.ts` — Tauri-only:
  `alwaysOnTop`, `opacity` (0.3–1), `mapOpacity` (0–1), `zoom`
  (`"75" | "100" | "125" | "150"`), `minimizeToTray` (default false; when on,
  ✕ hides to tray instead of closing), plus a deliberately session-only
  `clickThrough` (plain `ref()`, not `persistedRef` — see note below).
- `apps/client/src/features/airdrop/store.ts` — `dropMarkerRadius` (game
  meters, slider-bound in Settings). Wraps the airdrop state machine —
  `phase` and `outcome` are derived runtime state, not persisted.

Each store uses `persistedRef` from `@/shared/persisted-store` with its
own key (`tc.<feature>.<field>`) — corrupt persisted data falls back to
defaults silently.

**Session-only state.** `clickThrough` intentionally does NOT use `persistedRef`.
Booting into a locked overlay with a broken hotkey would be unrecoverable, so
`App.vue` resets the value to `false` on every Tauri startup. Reach for plain
`ref()` (not `persistedRef`) any time boot-time recoverability matters more than
user-visible continuity; default to `persistedRef` everywhere else.

## Settings & layer registries

**Two SEPARATE registries, one per surface — no shared-id matching across them.**

- **Map-layer registry** (`features/map/layers/registry.ts`) — the single source
  of truth for layers. `registerMapLayer({ id, mount, category, order, titleKey,
  settingsComponent?, availability? })`; `useMapLayers()` reads them. Each layer
  self-describes its rail `category` (`'player' | 'loot' | 'quests'`), `order`,
  display `titleKey`, and optional inline `settingsComponent`. Layers register in
  their own `layers/<name>/index.ts` (auto-loaded via the layers glob). Consumed by
  the on-map **LayerRail** (`features/map/components/LayerRail.vue`): a left rail
  with the base map selector at the top (a direct `MapSection` import — it's a
  prerequisite, not a layer), then one icon per category (membership derived from
  each layer's `category`; empty categories like loot/quests render as dimmed
  future placeholders). A category flyout lists its layers, each with a visibility
  toggle (`useLayerVisibility`) + the layer's `settingsComponent` inline via a gear.
  `CATEGORY_META` in the rail is presentation-only (icon + which futures to tease),
  NOT the catalogue.
- **Settings-section registry** (`features/settings/registry.ts`) — **system/app
  settings only** (no layer concept; no groups/subgroups). `registerSettingsSection({
  id, order, titleKey, visible?, component })`; `useSettingsSections()` returns them
  filtered by `visible` (`'always'` | `'tauri'` | `'desktop-or-tauri'` | `'browser'`,
  where `'browser'` = `!isTauri`) and sorted by
  `order`. Registered in `features/<name>/settings.ts` (auto-loaded via
  `import.meta.glob('@/features/*/settings.ts', { eager: true })`). Currently: 10
  overlay (tauri), 20 hotkeys (always; rows read-only on a phone — no keyboard
  to record), 25 display (browser), 30 language,
  40 paths (desktop-or-tauri), 50 pairing (tauri). Consumed by the gear **drawer**
  (`SettingsPanel.vue`): a **non-modal** PrimeVue `Drawer` (right on desktop,
  bottom-sheet on `<640px`) rendering a single flat **Accordion**; open-panel state
  persists in `tc.settings.open`.

Faction colours come from `FACTION_COLORS` in `packages/shared/src/maps.ts`
so icons and tooltip stripes never drift across components.

## Mobile display (browser / phone)

`apps/client/src/features/display/` holds the browser/phone fullscreen affordance.
Browser-only — the Display settings section registers with `visible: 'browser'`
(`!isTauri`); the frameless Tauri overlay has no browser chrome, so it's moot there.

- **Fullscreen** lives ONLY in the Display settings section
  (`components/DisplaySection.vue`) — a `ToggleSwitch` bound to live fullscreen
  state via `composables/useFullscreenToggle.ts` (VueUse `useFullscreen` on
  `document.documentElement`, so the address bar collapses). Android/desktop get a
  real toggle; iOS Safari has **no Fullscreen API**, so on iOS the row shows an
  "Add to Home Screen" hint instead (the PWA `display: standalone` route is the
  only chrome-free path on iPhone). The whole row hides once installed as a PWA
  (`isStandalone`). The toggle is `.catch(() => undefined)` — `requestFullscreen`
  rejects in an iframe and there's nothing actionable. (There is no on-map
  fullscreen button — it was tried in the top-right cluster but removed to keep
  the bar uncluttered on narrow phones; see "Top bar" below.)
- `composables/useDisplayEnv.ts` exposes `isIos` (UA incl. iPadOS-as-Mac) and
  `isStandalone` (`matchMedia('(display-mode: standalone)')` + `navigator.standalone`).

**Top bar (browser).** The connection-status dot, the map name (only ≥380px), and
the two in-game clocks all live in the always-visible left chip
(`TarkovTimeChip.vue`), so the top-right browser cluster is just the settings gear
— this keeps the bar from overflowing on a 320px-wide phone (iPod touch). The clock
samples via `requestAnimationFrame` and swaps its ref only when the shown value
changes (in-game time runs 7×, so a fixed interval visibly stutters the seconds).

**Keep-awake was considered and deliberately dropped.** There is no reliable web
way to keep a mobile screen awake over plain HTTP: the Screen Wake Lock API needs a
secure context (HTTPS / `localhost` — neither reaches a LAN phone, and it's absent
entirely on iOS < 16.4), and the muted/unmuted looping-`<video>` trick no longer
keeps the screen on under current iOS **or** Android (verified on iPod touch iOS 15
+ Android). The honest fallback is the OS auto-lock setting. Don't re-add a JS
keep-awake hack unless serving over HTTPS becomes viable.

**PWA manifest** (`apps/client/public/manifest.webmanifest` + `<link rel="manifest">`
and the `apple-mobile-web-app-*` / `mobile-web-app-capable` meta in `index.html`):
`display: standalone`, icon = the existing `favicon.svg` (`sizes: "any"`).
`start_url`/`scope` are `/`, correct for the phone (`:5173`/`:47474`) and the Tauri
release (base `/`). The hosted **GitHub Pages** build serves under base
`/tarkov-checker/`, so its `start_url`/`scope` would mismatch — the static manifest
isn't templated by Vite. Pages PWA install is a secondary path; template the
manifest if it ever matters. iOS `apple-touch-icon` ideally wants a PNG — pointing
it at the SVG works on Android, but iPhone may fall back to a page screenshot for
the home-screen icon; rasterising `favicon.svg` to PNG is an open follow-up.

**PWA manifest** (`apps/client/public/manifest.webmanifest` + `<link rel="manifest">`
and the `apple-mobile-web-app-*` / `mobile-web-app-capable` meta in `index.html`):
`display: standalone`, icon = the existing `favicon.svg` (`sizes: "any"`).
`start_url`/`scope` are `/`, correct for the phone (`:5173`/`:47474`) and the Tauri
release (base `/`). The hosted **GitHub Pages** build serves under base
`/tarkov-checker/`, so its `start_url`/`scope` would mismatch — the static manifest
isn't templated by Vite. Pages PWA install is a secondary path; template the
manifest if it ever matters. iOS `apple-touch-icon` ideally wants a PNG — pointing
it at the SVG works on Android, but iPhone may fall back to a page screenshot for
the home-screen icon; rasterising `favicon.svg` to PNG is an open follow-up.

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

**Unlocked state:**
- **Drag region** — the entire top bar (OverlayHeader.vue) is clickable and grabbable.
  Uses an explicit `@mousedown` handler that calls `getCurrentWindow().startDragging()`
  rather than `data-tauri-drag-region` attribute, which is flaky on `decorations: false +
  transparent: true` windows. Idle, only a small nub shows; hovering/dragging reveals
  two separate zones as flex siblings: a drag pill (left, flex-1, visual only with "move"
  label) and the control cluster (right, auto-width with pointer events). The transport
  status dot, settings gear, and close button all live in the cluster; only the drag
  pill is pointer-disabled.
- **Close** — red ✕ button. With `minimizeToTray` off (default), runs through a
  PrimeVue `ConfirmDialog` so an accidental click can't kill the session. With it on,
  hides the window to the system tray (reversible via the tray's Show item) with no
  confirm.
- **Settings gear** — opens the system settings drawer (right-side desktop, bottom-sheet
  phone/overlay).
- **Opacity slider** — in the gear drawer (`OverlaySection.vue`), calls
  `Window.setOpacity()` (Windows Layered Window API). If the call rejects (the permission
  `core:window:allow-set-opacity` doesn't exist in Tauri 2.11.x), the composable
  silently falls back to `document.documentElement.style.opacity` so the slider remains
  visually responsive.
- **Zoom** — in the gear drawer, calls `WebviewWindow.setZoom(factor)`.

**Locked state (click-through):**
- **Rails & controls hide** — the top band vanishes, the LayerRail hides, and animated
  borders disappear for a clean map-only view.
- **Read-outs stay visible** — the clock+location pill (TarkovTimeChip, top-left),
  the connection status dot (OverlayHeader), the floor stepper chip (LayerRail,
  bottom-left on multi-floor maps), and the lock hotkey hint (OverlayLockIndicator,
  bottom-right) remain always-visible.
- **Unlock** — bottom-right corner: a `[Ctrl][Alt][L]` Kbd hint plus a lock button
  (`pi-lock-open` ↔ `pi-lock` in OverlayLockIndicator). State lives on `clickThrough`
  in the store. Click on the open lock or press the hotkey to toggle. **Only the
  global hotkey can unlock it** because once click-through is on the lock button itself
  isn't clickable (intentional escape hatch). App.vue _always_ resets `clickThrough` to
  `false` on Tauri startup — the locked state intentionally doesn't persist across
  sessions, so the app can't boot into an unrecoverable lockout.

**Lock global shortcut** is the ONLY client-registered hotkey:
`useGlobalShortcut` (via `@tauri-apps/plugin-global-shortcut`) binds
`"CommandOrControl+Alt+L"` in `App.vue` to toggle click-through. Kept
client-side on purpose — it's an overlay window op with no browser
meaning, and the proven plugin path preserves the recovery route out of
a click-through lockout. Handler fires on both `Pressed` and `Released`
— toggle only on `Pressed`. **Every other hotkey is backend-owned** —
see "Backend-owned hotkeys" below.

**Floor switching** (multi-floor maps only) — three paths:
- **GUI**: the floor stepper (▲/▼) at the bottom of the LayerRail.
- **Hotkey**: backend-owned `floor-up`/`floor-down` actions (always global, even while
  the game is focused).
- **Quick**: Alt + mouse wheel over the map (MapView.vue, captured in the capture phase
  before Leaflet's wheel-zoom, throttled ~120ms so trackpad doesn't skip floors).
  The floor stepper reads the current floor; locking the overlay hides the rail's
  stepper but keeps the read-only bottom-left floor chip, and hotkeys still work.

**Capabilities** (`apps/desktop/src-tauri/capabilities/default.json`)
must include the privileged window ops explicitly — `core:default`
covers basics only:

```
core:window:allow-set-always-on-top
core:window:allow-set-ignore-cursor-events
core:window:allow-close
core:window:allow-start-dragging
core:window:allow-hide
core:window:allow-show
core:window:allow-set-focus
core:webview:allow-set-webview-zoom
core:tray:default
core:menu:default
core:app:allow-default-window-icon
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

| Module                  | Role                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `http_server.rs`        | axum routes, CorsLayer, SSE handler, listens on `0.0.0.0:47474`                                    |
| `server/screenshots.rs` | `notify-debouncer-full` watcher (250 ms `awaitWriteFinish` equivalent); parses filename → position; opt-in recycle-bin delete after parse (see below) |
| `server/logs.rs`        | poll-tails latest `log_*/application_NNN.log`; emits `map-change` on `rcid:` / `Location:` hits    |
| `server/paths.rs`       | env → manual override → `winreg` auto-detect; returns `ResolvedPaths`                              |
| `server/config.rs`      | reads/writes `%APPDATA%/tarkov-checker/config.json`; rejects UNC paths                             |
| `server/events.rs`      | `ServerEvent` enum + `tokio::sync::broadcast` channel for HTTP-side fan-out                        |
| `watcher.rs`            | `WatcherSlot` state holder + `apply_resolved` that atomically swaps watcher handles                |
| `lan.rs`                | LAN IP detection for the QR pairing flow (multi-NIC heuristic — see `detect_lan_ip`)               |
| `commands.rs`           | Tauri `#[tauri::command]` adapters mirroring the HTTP routes + `pairing_qr`                        |

**Trust model: same Wi-Fi = trusted.** The helper always binds
`0.0.0.0:47474`. No bearer-token auth — browser drive-by callers are
gated by the `CorsLayer` Origin allowlist, and LAN-side
curl-equivalents are unfiltered by design. See PLAN-LAN-AND-TRAY.md
for the architectural reasoning.

**HTTP routes** (all under `0.0.0.0:47474`):

- `GET /api/ping` — public health probe (`{name, version, status}`).
- `GET /api/config` — current `ResolvedPaths`. Origin-allowlisted via
  `CorsLayer` (Vite dev `:5173`, hosted GitHub Pages); same
  JSON shape as the Tauri `get_config` IPC command.
- `PUT /api/config` — apply `ConfigPatch` (path overrides +
  `deleteScreenshots`), re-run `apply_resolved`, return the new
  `ConfigResponse`. UNC → 400 with `{error: "..."}`.
- `GET /api/hotkeys` — backend-owned combos (`HotkeyConfig`).
- `PUT /api/hotkeys` — apply `HotkeyPatch`, (re)register OS hotkeys,
  return the EFFECTIVE config (a combo that can't be claimed reverts).
  Unparseable combo → 400. See "Backend-owned hotkeys".
- `POST /api/hotkeys/{suspend,resume}` — drop / re-claim the OS binds
  while the settings recorder captures a combo (204).
- `GET /events` — Server-Sent Events stream. `ServerEvent` (tagged
  enum) frames; one `data: { type: "position"|"map-change"|"command", ... }`
  per watcher / hotkey emission. Keep-alive `: ping` every 25 s.

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
  - `invoke(...)`. Browser: same-origin `fetch('/api/*')` (Vite proxy
    in dev; direct on `127.0.0.1:47474` in the future hosted-frontend
    scenario where `https://<your-domain>` page hits localhost across
    origins, allowed by the browser localhost-exception in the Secure
    Contexts spec).

`PositionPayload` (struct in `screenshots.rs`) and `MapChangePayload`
(struct in `logs.rs`) on the Rust side mirror `PositionMessage` and
`MapChangeMessage` from `packages/shared/src/sse-messages.ts`. The
HTTP-side `ServerEvent` enum (in `server/events.rs`) is the tagged-
union wire format for SSE. Adding a new event type touches four
declarations (TS schema, TS discriminated union, Rust payload struct,
new `ServerEvent` variant) — e.g. the `hotkeys` config-resync event below.
(The file was `ws-messages.ts` before the SSE migration; renamed to
`sse-messages.ts`.)

## Backend-owned hotkeys

The backend is the single owner of the five forwarded hotkeys (`zoom-in`,
`zoom-out`, `floor-up`, `floor-down`, `airdrop`). It registers them as
**OS-global** shortcuts (fire even while the game is focused) and on a
press broadcasts `ServerEvent::Command { action }` so EVERY client —
overlay webview, browser, LAN phone — performs the action. The old
focus-required `useBrowserShortcut` and per-client `useGlobalShortcut`
wiring for these is gone; only the overlay **lock** combo stays
client-registered (see "Desktop overlay").

- Combos persist in `%APPDATA%/tarkov-checker/hotkeys.json` via
  `server/hotkeys.rs` (`HotkeyStore`, sibling to `config.json`). Defaults
  match the client's historical `tc.hotkeys.*` so an un-customised install
  is unchanged; the client migrates customised localStorage values up once
  (`tc.hotkeys.migrated`).
- Registration lives in `src/hotkeys.rs` behind one `HotkeyController`
  trait, with two impls that are **never** used together (the windowed app
  and headless backend are mutually exclusive — both bind :47474):
  - `TauriHotkeys` (`run()`): delegates to `tauri-plugin-global-shortcut`.
    The five combos are registered via the **plugin Builder**
    (`.with_shortcuts(...).with_handler(...)`) so registration happens on
    Tauri's main thread without the `run_on_main_thread` deadlock that
    registering inside our own `setup` hook would hit; a press-handler
    reads an `Arc<Mutex<id→action>>` map and emits `command`.
  - `StandaloneHotkeys` (`run_headless()`): there is no Tauri event loop,
    so it owns a dedicated OS thread that creates a
    `global_hotkey::GlobalHotKeyManager` and runs its **own Win32
    `PeekMessage` pump**, reading `WM_HOTKEY` directly. Required because
    `global-hotkey` needs a message pump on the manager's thread; the doc
    even says so. It does NOT use `GlobalHotKeyEvent::set_event_handler`.
- **Do not** run a standalone `global-hotkey` manager and the Tauri plugin
  in the SAME process: the plugin installs a process-global
  `GlobalHotKeyEvent::set_event_handler` (`OnceCell`), so a second
  manager's events would route to the plugin's handler (which doesn't know
  the ids) and the `receiver()` channel would get nothing. The two impls
  above sidestep this by never coexisting.
- The settings recorder brackets capture with the `HOTKEY_SUSPEND/RESUME`
  window events; `useHotkeysSync` (App.vue) bridges them to
  `POST /api/hotkeys/{suspend,resume}` so the backend drops its OS binds
  and the pressed combo reaches the page/webview to be re-recorded (the
  same events still drive the client-side lock shortcut).
- Wire parity follows the same 4-declaration rule as other events:
  `commandMessage` (zod) + union in `sse-messages.ts`, `ServerEvent::Command`
  + `HotkeyAction` (kebab-case) in `server/events.rs`. The client dispatches
  `command` in `pages/index.vue` (`useServerEvent('command', …)`) to
  `mapRef`/`airdropStore`.
- **Config re-sync:** a rebind broadcasts `ServerEvent::Hotkeys { config }`
  (`hotkeysMessage` in `sse-messages.ts`) from BOTH PUT paths —
  `put_hotkeys_http` (`state.event_tx`) and the `update_hotkeys` IPC command
  (`slot.event_sender()`, same broadcast channel) — so OTHER clients re-sync
  over SSE; the originator already has the effective config from its response.
  `useHotkeysSync` applies it via `store.applyConfig`. This is why the
  hotkeys section is `visible: 'always'` (read-only on a phone — no keyboard
  to record): the phone's list stays live with what the overlay set.

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
   Resource step depends on it). The icon set (`32x32.png`, `128x128.png`,
   `128x128@2x.png`, `icon.ico`, `icon.icns`, the `Square*Logo`/`StoreLogo`
   set) is generated from `apps/client/public/favicon.svg` via
   `pnpm --filter @tarkov-checker/desktop exec tauri icon <path>/favicon.svg`
   — the same mark the browser build uses. Re-run that after editing the SVG;
   the generator also emits `ios/` + `android/` dirs which we delete (this is a
   Windows-only desktop app). `icons/128x128.png` is also `include_bytes!`'d
   into the binary by `src/notify.rs` for the toast icon — see item 8.

8. **Toast notifications must register their own AppUserModelID.**
   `tauri-plugin-notification` only stamps the toast's AUMID when the exe runs
   from outside `target/{debug,release}` — but the portable .exe ships straight
   out of `target/release` and dev runs from `target/debug`, so the plugin
   always skips it and `notify-rust` falls back to PowerShell's identity (the
   toast shows "PowerShell" + its icon). Fix: we don't use the plugin.
   `src/notify.rs` registers `HKCU\Software\Classes\AppUserModelId\<identifier>`
   with a `DisplayName` + `IconUri` (the favicon PNG, written to
   `%APPDATA%/tarkov-checker/notification-icon.png`) at startup, then emits the
   toast via `tauri-winrt-notification::Toast::new(<identifier>)`. No installer
   / Start-Menu shortcut needed. Only used today for the one-time "still
   running in the tray" hint (`commands::notify_tray_hint`, fired by the
   client's `useCloseConfirm` gated on `tc.overlay.trayHintShown`).

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
