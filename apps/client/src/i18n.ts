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
  readonly labelAlways: string;
  readonly labelHint: string;
  readonly labelSize: string;
  readonly labelSizes: Readonly<Record<"sm" | "md" | "lg", string>>;
  readonly player: string;
  readonly playerFollow: string;
  readonly playerFollowHint: string;
  readonly playerFollowOptions: Readonly<Record<"off" | "sm" | "md" | "lg", string>>;
  readonly settings: string;
  readonly systemSection: string;
  readonly floor: string;
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
  readonly cache: {
    readonly heading: string;
    readonly lastUpdated: string;
    readonly never: string;
    readonly refresh: string;
    readonly refreshing: string;
    readonly hint: string;
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
    labelAlways: "Always",
    labelHint: "Always shows extract names; switch to On hover for a minimal view.",
    labelSize: "Label size",
    labelSizes: { sm: "S", md: "M", lg: "L" },
    player: "Player",
    playerFollow: "Auto-follow",
    playerFollowHint: "Recenter and zoom the map on every new position update.",
    playerFollowOptions: { off: "Off", sm: "S", md: "M", lg: "L" },
    settings: "Settings",
    systemSection: "System",
    floor: "Floor",
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
    cache: {
      heading: "Data cache",
      lastUpdated: "Last updated",
      never: "Never",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      hint: "Extract coordinates are cached locally. tarkov.dev may be blocked on some networks — fetch once, use offline.",
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
    labelAlways: "Всегда",
    labelHint: "Подписи видны всегда; переключи на «При наведении», если хочется меньше шума.",
    labelSize: "Размер подписей",
    labelSizes: { sm: "S", md: "M", lg: "L" },
    player: "Игрок",
    playerFollow: "Авто-следование",
    playerFollowHint: "Центрируем и приближаем карту при каждом новом обновлении позиции.",
    playerFollowOptions: { off: "Выкл", sm: "S", md: "M", lg: "L" },
    settings: "Настройки",
    systemSection: "Системные",
    floor: "Уровень",
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
    cache: {
      heading: "Кеш данных",
      lastUpdated: "Обновлено",
      never: "Никогда",
      refresh: "Обновить",
      refreshing: "Обновляю…",
      hint: "Координаты выходов кешируются локально. tarkov.dev иногда недоступен с RU IP — обновили один раз и пользуемся.",
    },
  },
};

export function useUiText(): ComputedRef<UiBundle> {
  const { apiLang } = storeToRefs(useSettingsStore());
  return computed(() => BUNDLES[apiLang.value]);
}
