# CLAUDE.md

## What each package owns

- `apps/server` — watches game files, broadcasts WS events, serves the
  built client in prod at `/` with WS at `/ws`.
- `apps/client` — Vue PWA + Leaflet map; runs on phone (LAN) and inside Tauri.
- `apps/desktop` — Tauri 2 wrapper; embeds the built client.
- `packages/shared` — source of truth for **all** WS payload shapes
  (zod schemas + inferred types) and for the raw-code → display-name +
  SVG-filename table in `src/maps.ts` (`bigmap` → `{displayName:"Customs",
  svgFile:"Customs.svg"}`). Never duplicate either in `apps/client` or
  `apps/server`.
- `apps/client/public/maps/` — git submodule of the community SVG maps
  ([the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps),
  CC BY-NC-SA 4.0). Served as static files by Vite at `/maps/<File>.svg`.
  Don't copy SVGs out of here — keep the license isolated to the submodule.

## Dev workflow

`pnpm dev` runs `turbo run dev` which brings up the server (`:3000`) and the
Vite dev server (`:5173`, host `0.0.0.0`) in parallel.

For the Tauri window, **in a second terminal**: `pnpm --filter
@tarkov-checker/desktop tauri:dev`. `beforeDevCommand` is intentionally empty
in `apps/desktop/src-tauri/tauri.conf.json` so Vite stays under Turbo's
orchestration and isn't double-spawned.

**On Windows, run Tauri from the junction**, not the OneDrive repo path —
`cd C:\tarkov-checker; pnpm --filter @tarkov-checker/desktop tauri:dev`.
The junction sidesteps a cargo-metadata crash on Cyrillic CWDs. See the
"Windows build quirks" section for the full list of pre-requisites
(HVCI off, Defender exclusions, target-dir outside OneDrive).

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

## tarkov.dev API client

`apps/client/src/api/tarkov-dev.ts` is a thin GraphQL client (plain
`fetch`, per-language promise cache, zod-validated payloads — no Apollo/
urql for a handful of queries). Schemas live in
`packages/shared/src/tarkov-api.ts` so the server can reuse them later
if needed.

`Map.nameId` from the API matches our raw Tarkov codes (`bigmap`,
`factory4_day`, `RezervBase`, ...) case-insensitively — see
`fetchExtractsForMap` for the lookup. The `lang` argument is keyed
into the cache so refetching after a language switch is just one HTTP
hit per language per session.

## Tarkov path resolution

`apps/server/src/watchers/paths.ts` resolves three paths each time the
config changes: `gameDir`, `logsDir` (defaults to `<gameDir>/Logs`),
and `screenshotsDir`. Priority highest-first: `.env` → manual override
in `apps/server/data/config.json` → Windows-registry auto-detect via
`reg query` (with `chcp 65001` first so Cyrillic Documents paths
decode). HTTP `GET/PUT /api/config` reads/writes the manual overrides
and the PUT re-applies the watchers atomically through
`WatcherManager.apply()`.

`SERVER_PORT` is the Fastify port (default 3000), deliberately
distinct from `PORT` because preview/dev tooling sometimes sets
`PORT=5173` for the whole runner. Don't read `PORT` in the server.

`@fastify/cors` must whitelist `PUT` explicitly — its default methods
list is `GET,HEAD,POST` and the preflight responds with 204 but the
actual PUT then gets dropped silently in the browser.

## User settings

`apps/client/src/stores/settings.ts` is the single Pinia store. Persisted
fields (zod-validated, versioned `STORAGE_KEY = "tarkov-checker:settings:v3"`):

- `apiLang` — `"en" | "ru"`
- `extractFactions` — array of `"pmc" | "scav" | "shared"`
- `extractLabelMode` — `"hover" | "always"` (tooltip permanence)
- `extractLabelSize` — `"sm" | "md" | "lg"` (font-size; applied via the
  `--extract-label-size` CSS variable on `<html>` from `useLeafletMap`)
- `playerFollow` — `"off" | "sm" | "md" | "lg"` — auto-recenter + zoom on
  every fresh position update. Wired in `useLeafletMap.setPlayerFollow`:
  the composable compares each incoming `(x, z)` against the last followed
  point and only re-centers when it actually changed (skips spam updates
  when the player is standing still). Zoom level per step is `initialZoom +
  FOLLOW_ZOOM_DELTA[mode]`.
- `mapCode` — current Tarkov map
- `overlayAlwaysOnTop`, `overlayClickThrough`, `overlayOpacity` (0.3–1),
  `overlayZoom` (`"75" | "100" | "125" | "150"`) — overlay-only, see
  "Desktop overlay" below

Corrupt persisted data → silent fallback to defaults. UI lives in
`components/SettingsPanel.vue` — gear icon sits in the **top-right** cluster
next to the WS status pill (App.vue), opens a PrimeVue `Drawer`
(right-side on desktop, `position="full"` on `<640px`). The drawer is split
into a top "frequently changed" section (Map / Extracts / Cache) and a
"СИСТЕМНЫЕ / System" sub-section (Language / Tarkov paths). The Overlay
fieldset is conditionally rendered only when `useTauriOverlay().isTauri`.

Extract label-size and label-mode are independent. `useLeafletMap.setLabelMode`
re-binds tooltips (permanent vs sticky), `setLabelSize` just writes
`--extract-label-size` (no rebind needed — CSS recalcs).

Faction colours come from `FACTION_COLORS` in `packages/shared/src/maps.ts`
so map icons and tooltip border-lefts never drift. **Tooltips** use Bender
Bold uppercase + `letter-spacing: 0.08em`, surface-900 background with a
3px faction-coloured left border (`.extract-tooltip--{pmc|scav|shared}`).
`useLeafletMap` appends the faction suffix to the tooltip className.

**Extract markers** are `L.marker` with `L.icon` referencing PNGs in
`public/icons/extracts/extract_{pmc,scav,shared}.png` (26×26 anchored
center). Earlier `CircleMarker` is gone. The `extracts` Leaflet pane is a
custom `<div>` (z 500) and needs an explicit CSS override in `styles.css`
to undo Tailwind preflight's `img { max-width: 100% }` — without it the
marker img collapses to width:0:
```
.leaflet-extracts-pane img.leaflet-marker-icon {
  max-width: none !important; max-height: none !important; width: auto;
}
```

## Desktop overlay (Tauri)

The Tauri 2 window is configured as a **frameless, transparent overlay**
(`apps/desktop/src-tauri/tauri.conf.json`): `decorations: false`,
`transparent: true`, `shadow: false`, default 360×360. There is no titlebar
and no native close button — close is in the app UI, drag is via
`startDragging()`.

Frontend access to window APIs goes through `useTauriOverlay()`
(`apps/client/src/composables/useTauriOverlay.ts`). Detection is
`"__TAURI_INTERNALS__" in window`. In browser context every method is a
no-op so the same code path serves both.

**Overlay controls** (only rendered when `isTauri`):
- **Drag region** — the WS-status pill in `App.vue`'s top-right cluster.
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
  *always* resets `overlayClickThrough` to `false` on Tauri startup —
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
   Add-MpPreference -ExclusionPath 'C:\tarkov-checker-target'
   Add-MpPreference -ExclusionPath '<repo path>'
   Add-MpPreference -ExclusionProcess 'rustc.exe'
   Add-MpPreference -ExclusionProcess 'cargo.exe'
   Add-MpPreference -ExclusionProcess 'link.exe'
   ```

3. **Move the cargo target dir out of OneDrive.** OneDrive racing on
   `target/` triggered random rustc segfaults early in the saga.
   `apps/desktop/src-tauri/.cargo/config.toml` sets
   `target-dir = "C:/tarkov-checker-target"`. This dir lives outside
   the repo and is the one Defender exclusion should cover.

4. **Cargo metadata crashes on Cyrillic CWD.** Even with HVCI off and
   exclusions in place, running `cargo metadata` (or `tauri dev`, which
   calls it) from a CWD containing non-ASCII characters segfaults. The
   workaround is an NTFS junction with an ASCII alias:
   ```
   mklink /J C:\tarkov-checker "<repo path with Cyrillic>"
   ```
   Run Tauri from the junction: `cd C:\tarkov-checker; pnpm --filter
   @tarkov-checker/desktop tauri:dev`. The junction is transparent to
   git, pnpm, vite, and cargo (cargo internally canonicalises the path
   back to the OneDrive original, but that only matters once `cargo
   metadata` has already succeeded from the ASCII entry point).

5. **`Cargo.toml` needs explicit `[[bin]]` + `default-run`.** Without
   them tauri-cli panics at `tauri-cli/src/interface/rust.rs:1149`
   (`unwrap()` on None) before any compilation starts. The current
   manifest has both.

6. **`embed-resource`'s `rustc --version` call is flaky** when new
   deps land in the lockfile. The build script panics with
   `couldn't get rustc version: CommandError { stdout: "", stderr: "" }`.
   Re-running `tauri:dev` is almost always enough — incremental cargo
   resumes and the second attempt succeeds.

7. **Icons must exist for `tauri-build` on Windows.** At minimum
   `apps/desktop/src-tauri/icons/icon.ico` must be present (the Windows
   Resource step depends on it). Placeholder PNGs at 32×32, 128×128,
   128×128@2x are also referenced in `tauri.conf.json` and ship today
   as solid purple squares — replace before any release.

## Other environment quirks

- Bash on Windows (msys2 inside Git for Windows) occasionally fails to
  spawn child processes with `STATUS_ACCESS_VIOLATION`. The exception is
  msys2-side, not the tool's fault — invoke via PowerShell when
  reproducibility matters. `2>&1` in PowerShell with native commands
  wraps stderr as ErrorRecord and trips `$?` even on success; use the
  default stream behaviour and let PS capture both streams to file.
- PWA icons under `apps/client/public/icons/` (root) are placeholders
  separate from the Tauri ones in `apps/desktop/src-tauri/icons/`.
