import { computed, type ComputedRef } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore, type ApiLang, type ExtractFactionFilter } from "./stores/settings";

interface UiBundle {
  readonly language: string;
  readonly map: string;
  readonly extracts: string;
  readonly on: string;
  readonly off: string;
  readonly labels: string;
  readonly labelHover: string;
  readonly labelSmart: string;
  readonly labelHint: string;
  readonly settings: string;
  readonly factions: Readonly<Record<ExtractFactionFilter, string>>;
  readonly paths: {
    readonly heading: string;
    readonly gameDir: string;
    readonly screenshotsDir: string;
    readonly logsDir: string;
    readonly save: string;
    readonly saved: string;
    readonly mobileHint: string;
    readonly source: Readonly<Record<"env" | "manual" | "detected" | "missing", string>>;
    readonly missingTooltip: string;
    readonly placeholderGameDir: string;
    readonly placeholderScreenshotsDir: string;
  };
}

const BUNDLES: Readonly<Record<ApiLang, UiBundle>> = {
  en: {
    language: "Language",
    map: "Map",
    extracts: "Extracts",
    on: "On",
    off: "Off",
    labels: "Labels",
    labelHover: "On hover",
    labelSmart: "Always",
    labelHint: "Always shows extract names; switch to On hover for a minimal view.",
    settings: "Settings",
    factions: {
      pmc: "PMC",
      scav: "Scav",
      shared: "Shared",
    },
    paths: {
      heading: "Tarkov paths",
      gameDir: "Game folder",
      screenshotsDir: "Screenshots folder",
      logsDir: "Logs",
      save: "Save",
      saved: "Saved",
      mobileHint: "Open this page on the machine running Tarkov to configure paths.",
      source: {
        env: "from .env",
        manual: "manual",
        detected: "auto-detected",
        missing: "not found",
      },
      missingTooltip: "Folder doesn't exist on disk yet.",
      placeholderGameDir: "D:\\EFT",
      placeholderScreenshotsDir: "Documents\\Escape from Tarkov\\Screenshots",
    },
  },
  ru: {
    language: "Язык",
    map: "Карта",
    extracts: "Выходы",
    on: "Вкл",
    off: "Выкл",
    labels: "Подписи",
    labelHover: "При наведении",
    labelSmart: "Всегда",
    labelHint: "Подписи видны всегда; переключи на «При наведении», если хочется меньше шума.",
    settings: "Настройки",
    factions: {
      pmc: "ЧВК",
      scav: "Дикие",
      shared: "Общие",
    },
    paths: {
      heading: "Пути Tarkov",
      gameDir: "Папка с игрой",
      screenshotsDir: "Папка скриншотов",
      logsDir: "Логи",
      save: "Сохранить",
      saved: "Сохранено",
      mobileHint: "Открой эту страницу на машине с Tarkov, чтобы настроить пути.",
      source: {
        env: "из .env",
        manual: "вручную",
        detected: "найдено автоматически",
        missing: "не найдено",
      },
      missingTooltip: "Папка пока не существует.",
      placeholderGameDir: "D:\\EFT",
      placeholderScreenshotsDir: "Documents\\Escape from Tarkov\\Screenshots",
    },
  },
};

export function useUiText(): ComputedRef<UiBundle> {
  const { apiLang } = storeToRefs(useSettingsStore());
  return computed(() => BUNDLES[apiLang.value]);
}
