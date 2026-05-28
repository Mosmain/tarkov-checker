import { defineConfig } from "vite";
import VueRouter from "vue-router/vite";
import vue from "@vitejs/plugin-vue";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { PrimeVueResolver } from "@primevue/auto-import-resolver";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

const sharedSrc = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const clientSrc = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
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
    }),
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
  },
});
