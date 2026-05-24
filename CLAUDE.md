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

`useLeafletMap.ts` uses `L.CRS.Simple` (flat coords, no Web Mercator) +
`L.svgOverlay` with bounds derived from the SVG's `viewBox`. SVGs are
fetched at runtime from `/maps/<File>.svg` and parsed with `DOMParser`
so top-level `<g>` groups stay accessible for future floor toggling.

Floor-group semantics differ per map: single-level maps (Customs, Woods,
Shoreline, Lighthouse) have feature layers as top-level `<g>` (Ground,
Trees, Buildings, ...), while multi-level maps (Factory, Reserve,
Interchange, Labs) have floor groups (Basement, Ground_Floor, ...). Any
floor-switcher UI must consult a per-map allowlist of which group IDs
are "floors" — don't toggle all top-level groups blindly.

In-game (x, z) → SVG (x, y) calibration is **per-map and not provided
upstream**; will be measured empirically once real position events
arrive over WS.

## Environment quirks hit during bootstrap

- Rust toolchain was not installed when the monorepo was scaffolded, so the
  Tauri Rust side (`cargo check`, `tauri build`) was never exercised during
  bootstrap verification. Files are hand-written from the Tauri 2 template;
  expect the first `tauri:dev` to pull dependencies.
- PWA icons under `apps/client/public/icons/` are placeholders. The build
  succeeds; replace before any real PWA release.
- The repo lives under a OneDrive path with Cyrillic segments. On Windows,
  some Node tools occasionally segfault on spawn — re-running usually works.
