import { z } from "zod";
import { persistedRef } from "../../shared/persisted-store";

const apiLangSchema = z.enum(["en", "ru"]);
export type ApiLang = z.infer<typeof apiLangSchema>;

export const useI18nStore = defineStore("i18n", () => {
  const apiLang = persistedRef("tc.i18n.apiLang", apiLangSchema, "en" as ApiLang);

  // Mirror the persisted apiLang into the vue-i18n instance: on first read
  // (initial value), and on every subsequent change. `setLocale` is lazy —
  // the JSON for a locale is fetched on first switch, cached after.
  // Imported dynamically to avoid a runtime circular dep (./index re-exports
  // a type from this file).
  watch(
    apiLang,
    (lang) => {
      void import("./index").then(({ setLocale }) => setLocale(lang));
    },
    { immediate: true },
  );

  return { apiLang };
});
