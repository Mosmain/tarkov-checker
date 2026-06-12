import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

const apiLangSchema = z.enum(['en', 'ru']);
export type ApiLang = z.infer<typeof apiLangSchema>;

// First-launch default: match the system/browser language when we support it,
// else fall back to English. Only consulted when nothing is persisted yet, so a
// later manual choice always wins.
function detectInitialLang(): ApiLang {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')) {
    return 'ru';
  }
  return 'en';
}

export const useI18nStore = defineStore('i18n', () => {
  const apiLang = persistedRef('rm.i18n.apiLang', apiLangSchema, detectInitialLang());

  // Mirror the persisted apiLang into the vue-i18n instance: on first read
  // (initial value), and on every subsequent change. `setLocale` is lazy —
  // the JSON for a locale is fetched on first switch, cached after.
  // Imported dynamically to avoid a runtime circular dep (./index re-exports
  // a type from this file).
  watch(
    apiLang,
    (lang) => {
      void import('./index').then(({ setLocale }) => setLocale(lang));
    },
    { immediate: true },
  );

  return { apiLang };
});
