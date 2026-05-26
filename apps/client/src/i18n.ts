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
  readonly overlay: {
    readonly heading: string;
    readonly alwaysOnTop: string;
    readonly clickThrough: string;
    readonly clickThroughWarning: string;
    readonly opacity: string;
    readonly mapOpacity: string;
    readonly mapOpacityHint: string;
    readonly zoom: string;
    readonly quickMenuTitle: string;
  };
  readonly hotkeys: {
    readonly heading: string;
    readonly lock: string;
    readonly lockHint: string;
    readonly zoomIn: string;
    readonly zoomOut: string;
    readonly floorUp: string;
    readonly floorDown: string;
    readonly record: string;
    readonly recording: string;
    readonly recordingPrompt: string;
    readonly invalid: string;
    readonly conflict: string;
  };
  readonly closeConfirm: {
    readonly title: string;
    readonly message: string;
    readonly accept: string;
    readonly reject: string;
  };
  readonly tray: {
    readonly toggleLock: string;
    readonly showWindow: string;
    readonly quit: string;
    readonly tooltip: string;
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
    overlay: {
      heading: "Overlay",
      alwaysOnTop: "Always on top",
      clickThrough: "Click-through",
      clickThroughWarning: "Once enabled, you can't click the window. Restart the app to re-enable interaction.",
      opacity: "Opacity",
      mapOpacity: "Map opacity",
      mapOpacityHint: "Available when overall opacity is below 100%.",
      zoom: "Zoom",
      quickMenuTitle: "Transparency",
    },
    hotkeys: {
      heading: "Hotkeys",
      lock: "Toggle lock",
      lockHint: "Pressed globally to toggle click-through. F1–F24 work without a modifier; everything else needs Ctrl/Alt/Shift.",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      floorUp: "Next floor",
      floorDown: "Previous floor",
      record: "Change",
      recording: "Recording…",
      recordingPrompt: "Press the new combination (Esc to cancel)",
      invalid: "Need a modifier (Ctrl/Alt/Shift) — or a bare F-key.",
      conflict: "This combination is taken by another app. Try another.",
    },
    closeConfirm: {
      title: "Close the app?",
      message: "The window will be closed.",
      accept: "Close",
      reject: "Cancel",
    },
    tray: {
      toggleLock: "Toggle lock",
      showWindow: "Show window",
      quit: "Quit",
      tooltip: "tarkov-checker",
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
    overlay: {
      heading: "Оверлей",
      alwaysOnTop: "Поверх всех окон",
      clickThrough: "Прозрачное для кликов",
      clickThroughWarning: "После включения окно перестанет реагировать на мышь. Чтобы вернуть взаимодействие — перезапусти приложение.",
      opacity: "Прозрачность",
      mapOpacity: "Прозрачность карты",
      mapOpacityHint: "Доступно когда общая прозрачность ниже 100%.",
      zoom: "Масштаб",
      quickMenuTitle: "Прозрачность",
    },
    hotkeys: {
      heading: "Хоткеи",
      lock: "Переключить блокировку",
      lockHint: "Глобально переключает click-through. F1–F24 работают без модификатора; всем остальным нужен Ctrl/Alt/Shift.",
      zoomIn: "Приблизить",
      zoomOut: "Отдалить",
      floorUp: "Следующий этаж",
      floorDown: "Предыдущий этаж",
      record: "Изменить",
      recording: "Запись…",
      recordingPrompt: "Нажми новое сочетание (Esc — отмена)",
      invalid: "Нужен модификатор (Ctrl/Alt/Shift) — или F-клавиша без него.",
      conflict: "Это сочетание уже занято другим приложением. Попробуй другое.",
    },
    closeConfirm: {
      title: "Закрыть приложение?",
      message: "Окно будет закрыто.",
      accept: "Закрыть",
      reject: "Отмена",
    },
    tray: {
      toggleLock: "Переключить блокировку",
      showWindow: "Показать окно",
      quit: "Выход",
      tooltip: "tarkov-checker",
    },
  },
};

export function useUiText(): ComputedRef<UiBundle> {
  const { apiLang } = storeToRefs(useSettingsStore());
  return computed(() => BUNDLES[apiLang.value]);
}
