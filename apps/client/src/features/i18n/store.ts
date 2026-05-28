import { z } from "zod";
import { persistedRef } from "../../shared/persisted-store";

const apiLangSchema = z.enum(["en", "ru"]);
export type ApiLang = z.infer<typeof apiLangSchema>;

export const useI18nStore = defineStore("i18n", () => {
  const apiLang = persistedRef("tc.i18n.apiLang", apiLangSchema, "en" as ApiLang);
  return { apiLang };
});
