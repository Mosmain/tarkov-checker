import { computed, type ComputedRef } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore, type ApiLang, type ExtractFactionFilter } from "./stores/settings";

interface UiBundle {
  readonly language: string;
  readonly extracts: string;
  readonly on: string;
  readonly off: string;
  readonly labels: string;
  readonly labelHover: string;
  readonly labelSmart: string;
  readonly labelHint: string;
  readonly settings: string;
  readonly factions: Readonly<Record<ExtractFactionFilter, string>>;
}

const BUNDLES: Readonly<Record<ApiLang, UiBundle>> = {
  en: {
    language: "Language",
    extracts: "Extracts",
    on: "On",
    off: "Off",
    labels: "Labels",
    labelHover: "On hover",
    labelSmart: "Smart",
    labelHint: "Smart shows names only for extracts visible on screen at higher zoom.",
    settings: "Settings",
    factions: {
      pmc: "PMC",
      scav: "Scav",
      shared: "Shared",
    },
  },
  ru: {
    language: "Язык",
    extracts: "Выходы",
    on: "Вкл",
    off: "Выкл",
    labels: "Подписи",
    labelHover: "При наведении",
    labelSmart: "Авто",
    labelHint: "Авто-подписи появляются для выходов в кадре при достаточном приближении.",
    settings: "Настройки",
    factions: {
      pmc: "ЧВК",
      scav: "Дикие",
      shared: "Общие",
    },
  },
};

export function useUiText(): ComputedRef<UiBundle> {
  const { apiLang } = storeToRefs(useSettingsStore());
  return computed(() => BUNDLES[apiLang.value]);
}
