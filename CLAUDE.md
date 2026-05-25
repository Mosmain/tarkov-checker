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

## Path aliases

`@shared` and `@shared/*` resolve to `packages/shared/src/*`. Declared in
`tsconfig.base.json` (TS) and re-declared as regex aliases in
`apps/client/{vite,vitest}.config.ts` (Vite resolution).

## Tooling

- Vitest for tests (client only for now)
- ESLint flat config (`eslint.config.js`) + Prettier
- `no-console` is a warn; `@typescript-eslint/no-explicit-any` is an error

## Tailwind v4 note

Configuration is CSS-first via `@theme` — there is **no `tailwind.config.ts`**
(the spec listed one; v4 doesn't need it). Wired through `@tailwindcss/vite` and
`@import "tailwindcss";` in `apps/client/src/styles.css`.

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

## User settings

`apps/client/src/stores/settings.ts` is the single Pinia store holding
`apiLang` / `extractFactions` / `extractsVisible` / `extractLabelMode`.
Persists to `localStorage` under a versioned key via a deep `watch`,
validates on load with a zod schema (corrupt data → silent fallback to
defaults). UI lives in `components/SettingsPanel.vue` — gear icon in
the bottom-right, popover above. `App.vue` wires three watchers that
push the relevant settings into the Leaflet composable (no setting
needs a full reload).

Smart labels (`extractLabelMode === "smart"`) show extract names only
for markers whose latLng is inside `map.getBounds()` AND whose zoom is
at least `initialZoom + SMART_LABEL_ZOOM_DELTA`. The threshold lives
as a constant in `useLeafletMap.ts` — tune there, not in settings.
Faction colours come from `FACTION_COLORS` in `packages/shared/src/
maps.ts` so map markers and the legend in the popover never drift.

## Environment quirks hit during bootstrap

- Rust toolchain was not installed when the monorepo was scaffolded, so the
  Tauri Rust side (`cargo check`, `tauri build`) was never exercised during
  bootstrap verification. Files are hand-written from the Tauri 2 template;
  expect the first `tauri:dev` to pull dependencies.
- PWA icons under `apps/client/public/icons/` are placeholders. The build
  succeeds; replace before any real PWA release.
- The repo lives under a OneDrive path with Cyrillic segments. On Windows,
  some Node tools occasionally segfault on spawn — re-running usually works.
