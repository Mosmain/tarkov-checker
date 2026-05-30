# @tarkov-checker/client

Vue + Leaflet map. Runs both inside the Tauri overlay (`apps/desktop`) and as a plain browser page on phones over LAN (the same prod build Fastify serves at `:3000/`). Same code path, different transport (Tauri events vs SSE / `EventSource`).

Specifics about Tauri internals, Windows build quirks, and dev workflow live in [the repo CLAUDE.md](../../CLAUDE.md). This README is for contributors working **inside the client**.

## Stack

- **Vue 3.5** (Composition API, `<script setup>`)
- **Pinia 3** — state
- **Vue Router 5** — file-based routing via [`vue-router/vite`](./vite.config.ts)
- **Vite 8** + **Vitest 4**
- **vue-i18n 11** — JSON locale files, lazy-loaded
- **PrimeVue 4** (Aura preset, custom purple primary) + **Tailwind v4** (CSS-first, no `tailwind.config.ts`)
- **Leaflet 1.9** — custom CRS per Tarkov map, see [useLeafletMap.ts](./src/features/map/composables/useLeafletMap.ts)
- **Zod** at every boundary (localStorage, API, server-pushed SSE messages)

## `src/` structure

```
app/        Composition root — router config.
pages/      File-based routes. Add a *.vue here → it becomes a route. typed-router.d.ts is regenerated on dev/build.
features/   One folder per business feature, each fully owns its slice:
  map/         Leaflet map framework (useLeafletMap, useFloorSwitcher), layers registry + built-in layers (extracts/player/airdrop), MapView component, static extracts dataset (data/extracts/<code>.json — one file per canonical map)
  airdrop/     Airdrop triangulation state machine, screenshot tracker, settings section
  overlay/     Tauri overlay window controls, opacity/zoom/mapOpacity sync, tray icon, overlay-specific components
  hotkeys/     Global shortcuts, HotkeyRecorder, accelerator parser
  server/      SSE/HTTP transport, typed IPC contract, server event bus, /api/config client
  i18n/        createI18n instance, store (apiLang persisted), locales/<code>.json files
  settings/    Settings registry, SettingsPanel.vue, section sub-components
shared/     Cross-feature utilities (persisted-store, config) — no business logic
App.vue     Tiny: <RouterView/> + ConfirmDialog + MapQuickMenu + side effects (transport, tray, lock hotkey)
main.ts     createApp → pinia + router + i18n + PrimeVue
theme.ts    PrimeVue Aura preset override (primary = purple)
styles.css  Tailwind imports, font-faces, dark mode token tweaks
```

Each feature folder has the same internal layout when applicable: `composables/`, `components/`, `api/`, `lib/`, `store.ts`.

## Import style

Hybrid: same-feature stays relative for "tight coupling" signal, cross-feature uses `@/` alias for visibility. Enforced by ESLint (`no-restricted-imports` blocks `../../*`).

| Case                 | Style                       | Example                                                 |
| -------------------- | --------------------------- | ------------------------------------------------------- |
| Same folder          | `./X`                       | `import { useFloorSwitcher } from "./useFloorSwitcher"` |
| Same feature, parent | `../X`                      | `import { useOverlayStore } from "../store"`            |
| Cross feature        | `@/features/<name>/...`     | `import { useUiText } from "@/features/i18n"`           |
| Cross layer          | `@/shared/...`, `@/app/...` | `import { apiBase } from "@/shared/config"`             |
| Workspace package    | `@shared/...`               | `import { TARKOV_MAPS } from "@shared/maps"`            |
| npm                  | bare                        | `import { useConfirm } from "primevue/useconfirm"`      |

The two `@shared` are different: `@shared/...` (no slash) is the workspace package at `packages/shared/`, `@/shared/...` is `apps/client/src/shared/`. Don't confuse them.

## Auto-imports

[`unplugin-auto-import`](./vite.config.ts) injects these as globals — **don't** write `import` for them:

- **Vue**: `ref`, `computed`, `watch`, `onMounted`, lifecycle, `defineProps`, `defineEmits`, `defineExpose`, type helpers (`Ref`, `ComputedRef`, ...)
- **Pinia**: `defineStore`, `storeToRefs`, `acceptHMRUpdate`
- **Vue Router**: `useRouter`, `useRoute`, `useLink`, route guards
- **VueUse**: `useMediaQuery`, `onClickOutside`, `useEventListener`, ...
- **vue-i18n**: `useI18n`

[`unplugin-vue-components`](./vite.config.ts) auto-registers **PrimeVue components** via resolver — just write `<Button>`, `<Drawer>`, `<Select>` in template, no import.

**What is NOT auto-imported** (deliberately — keep cross-feature dependencies explicit):

- Your own composables, stores, `.vue` components — always `import` explicitly.
- PrimeVue composables (`useConfirm`, `useToast`, ...) — explicit. Resolver only covers components.

Generated `.d.ts` files (`auto-imports.d.ts`, `components.d.ts`, `.eslintrc-auto-import.json`, `typed-router.d.ts`) are gitignored and regenerated on `pnpm dev`/`build`.

## Recipes

### Add a new page

1. Create `src/pages/raid.vue` (or any name).
2. That's it — Vue Router auto-generates the route `/raid`. `typed-router.d.ts` regenerates so `router.push('/raid')` autocompletes.

For nested or dynamic routes (`/raids/[id]`), see [Vue Router file-based docs](https://uvr.esm.is/guide/file-based-routing.html).

### Add a new feature

1. Create `src/features/<name>/` with whichever subfolders apply: `store.ts`, `composables/`, `components/`, `api/`, `lib/`.
2. Inside the feature: `./X` and `../X` imports.
3. Other features depend on yours via `@/features/<name>/<thing>`.
4. If the feature has persisted user settings — create `store.ts` using [`persistedRef`](./src/shared/persisted-store.ts) from `@/shared/persisted-store`. Each setting gets its own key like `tc.<name>.<field>`.
5. If the feature has its own settings UI:
   - Create a section component `XxxSection.vue` under [`features/settings/sections/`](./src/features/settings/sections/).
   - Create `src/features/<name>/settings.ts` that calls `registerSettingsSection()`:
     ```ts
     import { registerSettingsSection } from '@/features/settings/registry';
     registerSettingsSection({
       id: '<name>',
       group: 'main', // or 'system'
       order: 30, // multiples of 10
       visible: 'always', // or 'tauri', 'desktop-or-tauri'
       component: XxxSection,
     });
     ```
   - That's it — `main.ts` auto-discovers the file via `import.meta.glob('@/features/*/settings.ts', { eager: true })`.
6. If the feature adds a map layer (new extract/player marker/etc):
   - Create `src/features/map/layers/<name>/` with `useXxxLayer.ts` and `index.ts`.
   - Call `registerMapLayer({ id, mount: useXxxLayer })` in `index.ts`.
   - `main.ts` auto-discovers via `import.meta.glob('@/features/map/layers/*/index.ts', { eager: true })`.

### Add a new locale

1. Copy [`features/i18n/locales/en.json`](./src/features/i18n/locales/en.json) to `<code>.json` and translate values. Keys must match `en.json` exactly (it's the fallback).
2. Extend the enum in [`features/i18n/store.ts`](./src/features/i18n/store.ts):
   ```ts
   const apiLangSchema = z.enum(['en', 'ru', '<code>']);
   ```
3. Add to the language dropdown in [`features/settings/sections/LanguageSection.vue`](./src/features/settings/sections/LanguageSection.vue):
   ```ts
   { label: "<Native name>", value: "<code>" as const },
   ```

Only `en.json` is bundled eagerly — every other locale loads on demand via dynamic `import()`.

Extract names (`extractNames.<map>.<key>`) and map names (`mapNames.<code>`) are hand-curated per locale file — there is no runtime translation source anymore, so a new locale needs the operator to translate those keys. English values exist as a fallback (`MapSection`/`MapView` drop back to `TARKOV_MAPS[code].displayName` and to the JSON `key` itself when a translation is missing).

**Restart `vite dev` after editing locale JSON.** `@intlify/unplugin-vue-i18n` pre-compiles the files in its Vite plugin and does NOT re-trigger HMR on disk changes — without a restart, freshly added keys aren't visible (`te()` returns false, `t()` echoes the key back).

### Add a new map

1. Add an entry to [`packages/shared/src/maps.ts`](../../packages/shared/src/maps.ts)' `TARKOV_MAPS` with the raw Tarkov code as key — `svgFile`, `bounds`, `transform`, `rotation`, `floors`. Set `canonical: null` for a brand-new map, or `canonical: '<other code>'` if it shares an SVG with an existing map (factory day/night pattern).
2. Drop the SVG into the [`apps/client/public/maps/`](./public/maps/) submodule (or symlink from a fork).
3. Create [`src/features/map/data/extracts/<code>.json`](./src/features/map/data/extracts/) as a flat array of `{key, factions[], position}`. `import.meta.glob` picks it up automatically.
4. Add localized display names: `mapNames.<code>` and `extractNames.<code>.<key>` in both [`features/i18n/locales/en.json`](./src/features/i18n/locales/en.json) and [`ru.json`](./src/features/i18n/locales/ru.json). Restart `vite dev` for the locale plugin to see them.

The original 10 maps were seeded from tarkov.dev's GraphQL (`maps { nameId extracts { name faction position {x y z} } }`); it's known to ship buggy faction tags for some maps, so the JSON is the curated truth.

### Add a PrimeVue component

Just use it in a template:

```vue
<template>
  <Knob v-model="value" />
</template>
```

`unplugin-vue-components` + `PrimeVueResolver` auto-imports `<Knob>` from `primevue/knob` at build time. No script import needed.

### Add a PrimeVue composable (`useToast`, `useDialog`, ...)

Explicit import — resolver doesn't cover composables in PrimeVue 4:

```ts
import { useToast } from 'primevue/usetoast';
```

### Add a new IPC command (Tauri side adds one too)

1. Add an entry to [`features/server/api/ipc-contract.ts`](./src/features/server/api/ipc-contract.ts):
   ```ts
   get_loot: {
     args: {
       mapCode: string;
     }
     result: LootResponse;
   }
   ```
2. Write a wrapper in `features/server/api/` calling `callBackend({ tauri: { cmd: "get_loot", ... }, http: { ... }, parse: ... })`. The literal `cmd` value narrows args + result types automatically.
3. On the Rust side, add the matching `#[tauri::command]` in [`apps/desktop/src-tauri/src/commands.rs`](../desktop/src-tauri/src/commands.rs) for the Tauri IPC path, and an `axum` route in [`apps/desktop/src-tauri/src/http_server.rs`](../desktop/src-tauri/src/http_server.rs) for the browser-frontend path.

## Commands

```sh
pnpm dev        # Vite dev server on :5173 (host 0.0.0.0 for phone over LAN)
pnpm build      # vue-tsc + vite build → dist/
pnpm preview    # serve built dist/
pnpm test       # vitest run
pnpm typecheck  # vue-tsc -b --noEmit
pnpm lint       # eslint --max-warnings=0
```

Tauri overlay dev needs both this Vite server (port 5173) and `pnpm --filter @tarkov-checker/desktop tauri:dev` from a second terminal. See [CLAUDE.md → Dev workflow](../../CLAUDE.md#dev-workflow).

## Where things connect

- **Tauri detection** — centralized in [`shared/tauri.ts`](./src/shared/tauri.ts) as `isTauri` const. Checked at module load time, safe for non-DOM contexts. Used by transport layer, router, overlay composables, and settings visibility logic.
- **Server-pushed messages** — schema in [`@shared/ws-messages`](../../packages/shared/src/ws-messages.ts). Position + map-change events; Node server pushes over SSE, Rust port emits as Tauri events. Client uses the same Zod schema either way.
- **Tarkov map calibration** (CRS, bounds, rotation) — [`@shared/maps`](../../packages/shared/src/maps.ts). Modifying calibration affects both desktop and browser.
- **Map localization** — `useMapI18n()` composable in [`features/map/composables/useMapI18n.ts`](./src/features/map/composables/useMapI18n.ts) provides `localizedMapName(code)` with `te → t → displayName` fallback chain. Used in MapView + MapSection to stay in sync.
- **HTTP / IPC** — single dispatch in [`features/server/api/transport.ts`](./src/features/server/api/transport.ts).
- **Settings registry** — `registerSettingsSection()` in [`features/settings/registry.ts`](./src/features/settings/registry.ts). Each feature calls this at module load via `features/<name>/settings.ts`. Auto-discovered by `main.ts`.
- **Map layers registry** — `registerMapLayer()` in [`features/map/layers/registry.ts`](./src/features/map/layers/registry.ts). Each layer calls this via `features/map/layers/<name>/index.ts`. Auto-discovered by `main.ts`; mounted by `MapView.vue` in setup().

## See also

- [`CLAUDE.md`](../../CLAUDE.md) — repo-wide context: Tauri internals, Windows build quirks (HVCI/Defender), path resolution dual implementation (Node + Rust), why ASCII-only repo path matters.
- [`apps/desktop/README.md`](../desktop/README.md) — Tauri overlay specifics.
- [`packages/shared/`](../../packages/shared/) — Zod schemas + map calibration tables shared between client, Node server, and Rust port.
