import { defineConfig, type PluginOption } from "vite";
import VueRouter from "vue-router/vite";
import vue from "@vitejs/plugin-vue";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath, URL } from "node:url";

const sharedSrc = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const clientSrc = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(({ mode }) => ({
  // Tauri prints its own dev-server progress; don't let Vite wipe it.
  clearScreen: false,
  // Lets the frontend read TAURI_ENV_* (target triple, debug flag) via import.meta.env.
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  // App code is 100% Composition API, but PrimeVue 4 itself is implemented
  // with Options API internally (BaseComponent's `cx`, `sx`, `pt` helpers are
  // accessed as `this.*` from render functions). Stripping the Options-API
  // runtime breaks every PrimeVue component — leave __VUE_OPTIONS_API__ alone.
  define: {
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  plugins: [
    // Scans src/pages for *.vue files and generates the routes table at build
    // time. MUST come before vue() so its SFC transform can see <route> blocks
    // and inject typed-route metadata.
    VueRouter({
      routesFolder: "src/pages",
      dts: "src/typed-router.d.ts",
    }),
    vue(),
    // Auto-import the Vue/Pinia/Router/VueUse composition APIs so SFCs don't
    // need 5–10 lines of boilerplate imports each. Feature-owned composables
    // and stores are deliberately NOT auto-imported — explicit imports keep
    // cross-feature dependencies visible (and policeable by lint rules).
    AutoImport({
      imports: ["vue", "vue-router", "pinia", "@vueuse/core", "vue-i18n"],
      // Scope is intentionally narrow: framework idioms (ref/computed/watch,
      // defineStore, useRouter, VueUse) cover dozens of call sites each, so
      // dropping them as auto-imports pays back many lines per addition. We
      // deliberately do NOT auto-import PrimeVue composables (useConfirm,
      // useToast, ...) — @primevue/auto-import-resolver only handles
      // components, and listing each composable by hand here trades a single
      // explicit import for a runtime-crash risk if the entry is missed.
      dts: "src/auto-imports.d.ts",
      eslintrc: { enabled: true, filepath: "./.eslintrc-auto-import.json" },
      vueTemplate: true,
    }),
    // Auto-register PrimeVue components on demand. `dirs: []` disables the
    // default scan of src/components — we want auto-registration only for
    // the UI library, not our own components (which stay explicit).
    Components({
      resolvers: [PrimeVueResolver()],
      dts: "src/components.d.ts",
      dirs: [],
    }),
    // Compiles JSON locale files to a lean runtime format (parses faster on
    // app boot than re-parsing JSON) and exposes the global $t typing the
    // Volar plugin needs. Locale files live next to the i18n entry.
    VueI18nPlugin({
      include: [fileURLToPath(new URL("./src/features/i18n/locales/**", import.meta.url))],
      strictMessage: false,
      runtimeOnly: false,
    }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "tarkov-checker",
        short_name: "tarkov",
        description: "Escape from Tarkov live in-raid map",
        theme_color: "#0b0b0b",
        background_color: "#0b0b0b",
        display: "standalone",
        orientation: "portrait",
        // TODO: replace placeholder icons before first PWA release.
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Precache only the app shell. The default pattern dragged in legacy
        // font formats (.eot/.ttf/.woff — every browser we target prefers
        // woff2), the 342 KB primeicons SVG fallback (same reason), and every
        // map SVG from the submodule (one per Tarkov location — caching all 12
        // up-front blows the offline budget on a feature the user only opens
        // one map at a time). woff2 stays; .svg is handled via runtimeCaching.
        globPatterns: ["**/*.{js,css,html,woff2,png,webmanifest}"],
        runtimeCaching: [
          {
            // Map SVGs cache lazily — once the user visits a map, subsequent
            // loads of that map work offline. New maps don't require a config
            // change.
            urlPattern: ({ url }) => url.pathname.startsWith("/maps/"),
            handler: "CacheFirst",
            options: {
              cacheName: "tarkov-map-svgs",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // tarkov.dev GraphQL — short SWR so offline still shows the last
            // payload while a background refresh updates it.
            urlPattern: ({ url }) => url.hostname === "api.tarkov.dev",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "tarkov-dev-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 6 },
            },
          },
        ],
      },
    }),
    // `pnpm --filter @tarkov-checker/client analyze` runs `vite build --mode analyze`
    // and pops an interactive treemap of the production bundle.
    mode === "analyze" &&
      (visualizer({
        filename: "dist/stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }) as PluginOption),
  ],
  resolve: {
    alias: [
      { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      { find: /^@shared$/, replacement: `${sharedSrc}/index.ts` },
      { find: /^@\/(.*)$/, replacement: `${clientSrc}/$1` },
    ],
  },
  server: {
    host: true,
    port: 5173,
    // Surface port conflicts instead of silently picking 5174 — Tauri's devUrl is pinned.
    strictPort: true,
    // Rust rebuilds touch src-tauri/target on every save; without this Vite
    // re-bundles on each cargo write and HMR thrashes.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Matches tsconfig.base.json's target — lets Vite skip down-leveling syntax
    // already supported by every browser the PWA + Tauri WebView2 run on.
    target: "es2022",
    // modulePreload polyfill targets pre-2021 Safari/Firefox; our es2022 target
    // already excludes them, so the polyfill is dead weight in index.html.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Function-form so future deps fall into a vendor chunk without
        // hand-editing this list. Heavy single-purpose libs get pinned to
        // their own chunks so they cache independently of app code.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/leaflet/")) return "leaflet";
          if (id.includes("/zod/")) return "zod";
          if (/[\\/]node_modules[\\/](@vue|vue|pinia|@vueuse)[\\/]/.test(id)) {
            return "vue";
          }
          // PrimeVue and the rest: let Rollup decide chunk boundaries from the
          // import graph. Components only reachable via defineAsyncComponent
          // (e.g. SettingsPanel) end up in their own async chunks instead of
          // bloating the initial paint.
          return undefined;
        },
      },
      // VueUse 14.3.0 ships /* #__PURE__ */ in positions Rollup can't read
      // — known upstream issue, harmless side-effect annotation. Drop only
      // this specific warning so real ones still surface.
      onwarn(warning, defaultHandler) {
        if (warning.code === "INVALID_ANNOTATION" && warning.id?.includes("@vueuse/core")) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
}));
