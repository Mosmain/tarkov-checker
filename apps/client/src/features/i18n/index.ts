import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import type { ApiLang } from "./store";

/**
 * Translation messages for every locale we support. Keys are the JSON file
 * names under ./locales/. Adding a language is two steps: drop a new
 * `<code>.json` under ./locales/ matching en.json's shape, and add the code
 * to the apiLang enum in ./store.ts. Lazy-loading is wired below so the
 * extra locale doesn't enter the eager bundle.
 *
 * Only `en` is bundled eagerly — it doubles as the fallback when a key is
 * missing in another locale or before its file finishes loading.
 */
type MessageSchema = typeof en;

export const i18n = createI18n<MessageSchema, ApiLang, false>({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: { en } as Record<ApiLang, MessageSchema>,
  missingWarn: false,
  fallbackWarn: false,
});

const loaded = new Set<ApiLang>(["en"]);

/**
 * Set the active UI locale, lazy-loading its JSON the first time it's
 * needed. Safe to call concurrently — duplicate calls after the first
 * resolve immediately. If the import fails (unknown code, network), the
 * locale isn't switched and the current one stays active.
 */
export async function setLocale(code: ApiLang): Promise<void> {
  if (!loaded.has(code)) {
    try {
      const mod = await import(`./locales/${code}.json`);
      i18n.global.setLocaleMessage(code, mod.default);
      loaded.add(code);
    } catch {
      return;
    }
  }
  i18n.global.locale.value = code;
}
