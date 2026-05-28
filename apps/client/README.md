# @tarkov-checker/client

Vue PWA + Leaflet map. Runs both inside the Tauri overlay (`apps/desktop`) and as a plain browser PWA on phones over LAN. Same code path, different transport (Tauri events vs WebSocket).

Specifics about Tauri internals, Windows build quirks, and dev workflow live in [the repo CLAUDE.md](../../CLAUDE.md). This README is for contributors working **inside the client**.

## Stack

- **Vue 3.5** (Composition API, `<script setup>`)
- **Pinia 3** — state
- **Vue Router 5** — file-based routing via [`vue-router/vite`](./vite.config.ts)
- **Vite 8** + **Vitest 4**
- **vue-i18n 11** — JSON locale files, lazy-loaded
- **PrimeVue 4** (Aura preset, custom purple primary) + **Tailwind v4** (CSS-first, no `tailwind.config.ts`)
- **Leaflet 1.9** — custom CRS per Tarkov map, see [useLeafletMap.ts](./src/features/map/composables/useLeafletMap.ts)
- **Zod** at every boundary (localStorage, API, WS messages)

## `src/` structure

```
app/        Composition root — router config.
pages/      File-based routes. Add a *.vue here → it becomes a route. typed-router.d.ts is regenerated on dev/build.
features/   One folder per business feature, each fully owns its slice:
  map/         Leaflet map, extracts/floors/player composables, MapView component, tarkov.dev API client
  overlay/     Tauri overlay window controls, opacity/zoom sync, tray icon, overlay-specific components
  hotkeys/     Global shortcuts, HotkeyRecorder, accelerator parser
  server/      WS/HTTP transport, typed IPC contract, server event bus, /api/config + /api/extracts clients
  i18n/        createI18n instance, store (apiLang persisted), locales/<code>.json files
  settings/    SettingsPanel.vue + section sub-components — UI for stores owned by other features
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
5. If the feature has its own settings UI — add a `XxxSection.vue` under [`features/settings/sections/`](./src/features/settings/sections/) and import it in [`SettingsPanel.vue`](./src/features/settings/SettingsPanel.vue).

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

Only `en.json` is bundled eagerly — every other locale loads on demand via dynamic `import()`. Tarkov.dev API supports `en, ru, de, fr, es, it, ja, pl, pt, zh, ko` — extract names will localize for those automatically.

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
3. On the Rust side, add the matching `#[tauri::command]` in [`apps/desktop/src-tauri/src/commands.rs`](../desktop/src-tauri/src/commands.rs). On the Node side, add a Fastify route in `apps/server/src/`.

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

## Environment

| Var                | Default | Effect                                                                                                                  |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `VITE_SERVER_PORT` | `3000`  | Port the browser/PWA client expects for the LAN Node backend. Tauri builds ignore this (in-process Rust port owns IPC). |

## Where things connect

- **WS messages** (position/raid-start/raid-end/heartbeat) — schema in [`@shared/ws-messages`](../../packages/shared/src/ws-messages.ts). Both Node server and Rust port emit them; client uses the same Zod schema either way.
- **Tarkov map calibration** (CRS, bounds, rotation) — [`@shared/maps`](../../packages/shared/src/maps.ts). Modifying calibration affects both desktop and PWA.
- **HTTP / IPC** — single dispatch in [`features/server/api/transport.ts`](./src/features/server/api/transport.ts). Tauri detection via `"__TAURI_INTERNALS__" in window`.

## See also

- [`CLAUDE.md`](../../CLAUDE.md) — repo-wide context: Tauri internals, Windows build quirks (HVCI/Defender), path resolution dual implementation (Node + Rust), why ASCII-only repo path matters.
- [`apps/desktop/README.md`](../desktop/README.md) — Tauri overlay specifics.
- [`packages/shared/`](../../packages/shared/) — Zod schemas + map calibration tables shared between client, Node server, and Rust port.
