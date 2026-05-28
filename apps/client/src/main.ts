import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import App from "./App.vue";
import { router } from "@/app/router";
import { i18n } from "@/features/i18n";
import { TarkovPreset } from "./theme";
import "./styles.css";

// Tauri's IPC layer logs a warning on every HMR-replaced JS callback because
// Rust can no longer find the JS handler it had a promise on. These are pure
// dev-mode noise — production builds have no HMR. Suppress only the specific
// warning, leaving everything else through.
if (import.meta.env.DEV && typeof window !== "undefined") {
  const TAURI_ORPHAN_RE = /\[TAURI\] Couldn't find callback id/;
  for (const level of ["warn", "error"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === "string" && TAURI_ORPHAN_RE.test(args[0])) return;
      orig(...args);
    };
  }
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(ConfirmationService);
app.use(PrimeVue, {
  theme: {
    preset: TarkovPreset,
    options: {
      prefix: "p",
      darkModeSelector: ".dark",
      cssLayer: {
        name: "primevue",
        order: "theme, base, primevue, components, utilities",
      },
    },
  },
});
app.mount("#app");
