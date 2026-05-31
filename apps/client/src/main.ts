import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import App from './App.vue';
import { router } from '@/app/router';
import { setAuthToken } from '@/shared/auth';
import { i18n } from '@/features/i18n';
import { useI18nStore } from '@/features/i18n/store';
import { TarkovPreset } from './theme';
import './styles.css';

// Token-from-hash bootstrap (D4 phone-pairing).
//
// When the phone scans the pairing QR it lands on
// `http://<lan-ip>:47474/#token=<hex>`. The HTTP request to `/` is
// served by the helper's embedded SPA fallback (D1); the `#token=…`
// fragment never went on the wire — it stays in this process. We pull
// it out before the app boots, stash it into localStorage for the rest
// of the session, and clean the URL so the token never lands in
// browser history / bookmarks / shared screenshots.
//
// Runs unconditionally for the browser context. Inside the Tauri
// webview the location is `tauri://localhost/` with no hash, so the
// branch is a no-op there.
const hadTokenInHash = typeof window !== 'undefined' && window.location.hash.startsWith('#token=');
if (hadTokenInHash) {
  const raw = window.location.hash.slice('#token='.length);
  if (raw) {
    try {
      setAuthToken(decodeURIComponent(raw));
    } catch {
      // Malformed percent-encoding — fall back to the raw value.
      // The bearer comparison is byte-exact, so a wrong value just
      // means the user sees a 401 and re-pairs. Better than crashing
      // boot.
      setAuthToken(raw);
    }
  }
}

// IMPORTANT: side-effect import — populates the settings registry before
// createApp(). Each features/<name>/settings.ts calls registerSettingsSection
// at module load. Removing this line silently empties the Settings drawer.
import.meta.glob('@/features/*/settings.ts', { eager: true });

// IMPORTANT: side-effect import — populates the map layer registry before
// createApp(). Removing this line silently empties the map.
import.meta.glob('@/features/map/layers/*/index.ts', { eager: true });

// Tauri's IPC layer logs a warning on every HMR-replaced JS callback because
// Rust can no longer find the JS handler it had a promise on. These are pure
// dev-mode noise — production builds have no HMR. Suppress only the specific
// warning, leaving everything else through.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const TAURI_ORPHAN_RE = /\[TAURI\] Couldn't find callback id/;
  for (const level of ['warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && TAURI_ORPHAN_RE.test(args[0])) return;
      orig(...args);
    };
  }
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);

// Eager-init the i18n store so its `watch(apiLang, ..., {immediate: true})`
// fires now and pushes the persisted locale into vue-i18n before any
// component mounts. Otherwise the store only initialises when a component
// happens to read it (e.g. LanguageSection in Settings) — until then
// `i18n.locale` stays at the createI18n default ('en'), even if the user
// previously picked RU. Cheap (no I/O), idempotent.
useI18nStore();
app.use(ConfirmationService);
app.use(PrimeVue, {
  theme: {
    preset: TarkovPreset,
    options: {
      prefix: 'p',
      darkModeSelector: '.dark',
      cssLayer: {
        name: 'primevue',
        order: 'theme, base, primevue, components, utilities',
      },
    },
  },
});
// Clean the `#token=…` fragment from the URL bar.
//
// Why here and not next to the early bootstrap above: Vue Router with
// `createWebHistory` captures the initial location (including hash) at
// module-load time and re-applies it via its own `replaceState` on the
// first navigation. An earlier `history.replaceState` is silently
// undone by that. `router.isReady()` resolves AFTER the initial
// navigation has settled, so a replaceState here sticks.
//
// The token was already saved to localStorage by the early branch
// above, so this is purely cosmetic — the URL bar shouldn't leak the
// secret to bookmarks / browser history / shoulder surfing.
if (hadTokenInHash) {
  void router.isReady().then(() => {
    if (window.location.hash.startsWith('#token=')) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search,
      );
    }
  });
}

app.mount('#app');
