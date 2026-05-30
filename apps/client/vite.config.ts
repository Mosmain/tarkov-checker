import { defineConfig, type PluginOption } from 'vite';
import VueRouter from 'vue-router/vite';
import vue from '@vitejs/plugin-vue';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { PrimeVueResolver } from '@primevue/auto-import-resolver';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath, URL } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));
const clientSrc = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig(({ mode }) => ({
  // Tauri prints its own dev-server progress; don't let Vite wipe it.
  clearScreen: false,
  // Lets the frontend read TAURI_ENV_* (target triple, debug flag) via import.meta.env.
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  // App code is 100% Composition API, but PrimeVue 4 itself is implemented
  // with Options API internally (BaseComponent's `cx`, `sx`, `pt` helpers are
  // accessed as `this.*` from render functions). Stripping the Options-API
  // runtime breaks every PrimeVue component — leave __VUE_OPTIONS_API__ alone.
  define: {
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  plugins: [
    // Scans src/pages for *.vue files and generates the routes table at build
    // time. MUST come before vue() so its SFC transform can see <route> blocks
    // and inject typed-route metadata.
    VueRouter({
      routesFolder: 'src/pages',
      dts: 'src/typed-router.d.ts',
    }),
    vue(),
    // Auto-import the Vue/Pinia/Router/VueUse composition APIs so SFCs don't
    // need 5–10 lines of boilerplate imports each. Feature-owned composables
    // and stores are deliberately NOT auto-imported — explicit imports keep
    // cross-feature dependencies visible (and policeable by lint rules).
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'vue-i18n'],
      // Scope is intentionally narrow: framework idioms (ref/computed/watch,
      // defineStore, useRouter, VueUse) cover dozens of call sites each, so
      // dropping them as auto-imports pays back many lines per addition. We
      // deliberately do NOT auto-import PrimeVue composables (useConfirm,
      // useToast, ...) — @primevue/auto-import-resolver only handles
      // components, and listing each composable by hand here trades a single
      // explicit import for a runtime-crash risk if the entry is missed.
      dts: 'src/auto-imports.d.ts',
      eslintrc: { enabled: true, filepath: './.eslintrc-auto-import.json' },
      vueTemplate: true,
    }),
    // Auto-register PrimeVue components on demand. `dirs: []` disables the
    // default scan of src/components — we want auto-registration only for
    // the UI library, not our own components (which stay explicit).
    Components({
      resolvers: [PrimeVueResolver()],
      dts: 'src/components.d.ts',
      dirs: [],
    }),
    // Compiles JSON locale files to a lean runtime format (parses faster on
    // app boot than re-parsing JSON) and exposes the global $t typing the
    // Volar plugin needs. Locale files live next to the i18n entry.
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/features/i18n/locales/**', import.meta.url))],
      strictMessage: false,
      // All locale messages under `include` are precompiled by this plugin
      // at build time; setLocaleMessage in features/i18n/index.ts receives
      // those precompiled functions on lazy-load. No runtime message
      // compilation needed → drop the compiler (~15 KB gzip) from the bundle.
      runtimeOnly: true,
    }),
    tailwindcss(),
    // `pnpm --filter @tarkov-checker/client analyze` runs `vite build --mode analyze`
    // and pops an interactive treemap of the production bundle.
    mode === 'analyze' &&
      (visualizer({
        filename: 'dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
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
      ignored: ['**/src-tauri/**'],
    },
    // One-origin dev: page is served by Vite (:5173), backend by Fastify
    // (:3000), but the browser sees both at :5173. Removes CORS entirely
    // (was previously needed for /api/* preflights and the hijacked /events
    // response). http-proxy passes through chunked transfer-encoding, so
    // the SSE stream survives the hop without buffering.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/events': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    // Matches tsconfig.base.json's target — lets Vite skip down-leveling syntax
    // already supported by every browser and Tauri WebView2 we run on.
    target: 'es2022',
    // modulePreload polyfill targets pre-2021 Safari/Firefox; our es2022 target
    // already excludes them, so the polyfill is dead weight in index.html.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Function-form so future deps fall into a vendor chunk without
        // hand-editing this list. Heavy single-purpose libs get pinned to
        // their own chunks so they cache independently of app code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/leaflet/')) return 'leaflet';
          if (id.includes('/zod/')) return 'zod';
          if (/[\\/]node_modules[\\/](@vue|vue|pinia|@vueuse)[\\/]/.test(id)) {
            return 'vue';
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
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('@vueuse/core')) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
}));
