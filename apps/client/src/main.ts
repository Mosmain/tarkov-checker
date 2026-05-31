import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import App from './App.vue';
import { router } from '@/app/router';
import { i18n } from '@/features/i18n';
import { useI18nStore } from '@/features/i18n/store';
import { TarkovPreset } from './theme';
import './styles.css';

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
app.mount('#app');
