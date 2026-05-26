import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { z } from "zod";
import { TARKOV_MAPS, type TarkovMapCode } from "@shared/maps";

const STORAGE_KEY = "tarkov-checker:settings:v3";

const apiLangSchema = z.enum(["en", "ru"]);
const extractFactionSchema = z.enum(["pmc", "scav", "shared"]);
const labelModeSchema = z.enum(["hover", "always"]);
const labelSizeSchema = z.enum(["sm", "md", "lg"]);
const playerFollowSchema = z.enum(["off", "sm", "md", "lg"]);
const overlayZoomSchema = z.enum(["75", "100", "125", "150"]);
const mapCodeSchema = z.string().refine((s): s is TarkovMapCode => s in TARKOV_MAPS);
// Validates a Tauri global-shortcut accelerator string. Either:
//   * one+ modifier(s) followed by any non-empty main-key token, OR
//   * a bare F1..F24 key (allowed without modifiers — rarely used for typing).
// Other reserved system shortcuts aren't policed here — if register() rejects
// the combo the watcher surfaces the error and the previous shortcut stays.
const lockHotkeySchema = z
  .string()
  .regex(
    /^((CommandOrControl|Control|Ctrl|Alt|Shift|Meta|Super)\+)+[^+\s]+$|^F([1-9]|1[0-9]|2[0-4])$/,
  );

const persistedSchema = z.object({
  apiLang: apiLangSchema,
  extractFactions: z.array(extractFactionSchema),
  extractLabelMode: labelModeSchema,
  extractLabelSize: labelSizeSchema.default("md"),
  playerFollow: playerFollowSchema.default("off"),
  mapCode: mapCodeSchema.default("bigmap"),
  overlayAlwaysOnTop: z.boolean().default(false),
  overlayClickThrough: z.boolean().default(false),
  overlayOpacity: z.number().min(0.3).max(1).default(1),
  overlayMapOpacity: z.number().min(0).max(1).default(1),
  overlayZoom: overlayZoomSchema.default("100"),
  lockHotkey: lockHotkeySchema.default("CommandOrControl+Alt+L"),
  zoomInHotkey: lockHotkeySchema.default("CommandOrControl+="),
  zoomOutHotkey: lockHotkeySchema.default("CommandOrControl+-"),
  floorUpHotkey: lockHotkeySchema.default("CommandOrControl+Shift+="),
  floorDownHotkey: lockHotkeySchema.default("CommandOrControl+Shift+-"),
});

export type ApiLang = z.infer<typeof apiLangSchema>;
export type ExtractFactionFilter = z.infer<typeof extractFactionSchema>;
export type ExtractLabelMode = z.infer<typeof labelModeSchema>;
export type ExtractLabelSize = z.infer<typeof labelSizeSchema>;
export type PlayerFollow = z.infer<typeof playerFollowSchema>;
export type OverlayZoom = z.infer<typeof overlayZoomSchema>;

const DEFAULTS = {
  apiLang: "en" as const,
  extractFactions: ["pmc", "scav", "shared"] as const satisfies readonly ExtractFactionFilter[],
  extractLabelMode: "always" as const,
  extractLabelSize: "md" as const,
  playerFollow: "off" as const,
  mapCode: "bigmap" as const satisfies TarkovMapCode,
  overlayAlwaysOnTop: false,
  overlayClickThrough: false,
  overlayOpacity: 1,
  overlayMapOpacity: 1,
  overlayZoom: "100" as const,
  lockHotkey: "CommandOrControl+Alt+L",
  zoomInHotkey: "CommandOrControl+=",
  zoomOutHotkey: "CommandOrControl+-",
  floorUpHotkey: "CommandOrControl+Shift+=",
  floorDownHotkey: "CommandOrControl+Shift+-",
};

function defaultState(): z.infer<typeof persistedSchema> {
  return {
    apiLang: DEFAULTS.apiLang,
    extractFactions: [...DEFAULTS.extractFactions],
    extractLabelMode: DEFAULTS.extractLabelMode,
    extractLabelSize: DEFAULTS.extractLabelSize,
    playerFollow: DEFAULTS.playerFollow,
    mapCode: DEFAULTS.mapCode,
    overlayAlwaysOnTop: DEFAULTS.overlayAlwaysOnTop,
    overlayClickThrough: DEFAULTS.overlayClickThrough,
    overlayOpacity: DEFAULTS.overlayOpacity,
    overlayMapOpacity: DEFAULTS.overlayMapOpacity,
    overlayZoom: DEFAULTS.overlayZoom,
    lockHotkey: DEFAULTS.lockHotkey,
    zoomInHotkey: DEFAULTS.zoomInHotkey,
    zoomOutHotkey: DEFAULTS.zoomOutHotkey,
    floorUpHotkey: DEFAULTS.floorUpHotkey,
    floorDownHotkey: DEFAULTS.floorDownHotkey,
  };
}

function loadFromStorage(): z.infer<typeof persistedSchema> {
  if (typeof localStorage === "undefined") return defaultState();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = persistedSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to defaults
  }
  return defaultState();
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadFromStorage();

  const apiLang = ref<ApiLang>(initial.apiLang);
  const extractFactions = ref<ExtractFactionFilter[]>([...initial.extractFactions]);
  const extractLabelMode = ref<ExtractLabelMode>(initial.extractLabelMode);
  const extractLabelSize = ref<ExtractLabelSize>(initial.extractLabelSize);
  const playerFollow = ref<PlayerFollow>(initial.playerFollow);
  const mapCode = ref<TarkovMapCode>(initial.mapCode);
  const overlayAlwaysOnTop = ref<boolean>(initial.overlayAlwaysOnTop);
  const overlayClickThrough = ref<boolean>(initial.overlayClickThrough);
  const overlayOpacity = ref<number>(initial.overlayOpacity);
  const overlayMapOpacity = ref<number>(initial.overlayMapOpacity);
  const overlayZoom = ref<OverlayZoom>(initial.overlayZoom);
  const lockHotkey = ref<string>(initial.lockHotkey);
  const zoomInHotkey = ref<string>(initial.zoomInHotkey);
  const zoomOutHotkey = ref<string>(initial.zoomOutHotkey);
  const floorUpHotkey = ref<string>(initial.floorUpHotkey);
  const floorDownHotkey = ref<string>(initial.floorDownHotkey);

  watch(
    [
      apiLang,
      extractFactions,
      extractLabelMode,
      extractLabelSize,
      playerFollow,
      mapCode,
      overlayAlwaysOnTop,
      overlayClickThrough,
      overlayOpacity,
      overlayMapOpacity,
      overlayZoom,
      lockHotkey,
      zoomInHotkey,
      zoomOutHotkey,
      floorUpHotkey,
      floorDownHotkey,
    ],
    () => {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          apiLang: apiLang.value,
          extractFactions: extractFactions.value,
          extractLabelMode: extractLabelMode.value,
          extractLabelSize: extractLabelSize.value,
          playerFollow: playerFollow.value,
          mapCode: mapCode.value,
          overlayAlwaysOnTop: overlayAlwaysOnTop.value,
          overlayClickThrough: overlayClickThrough.value,
          overlayOpacity: overlayOpacity.value,
          overlayMapOpacity: overlayMapOpacity.value,
          overlayZoom: overlayZoom.value,
          lockHotkey: lockHotkey.value,
          zoomInHotkey: zoomInHotkey.value,
          zoomOutHotkey: zoomOutHotkey.value,
          floorUpHotkey: floorUpHotkey.value,
          floorDownHotkey: floorDownHotkey.value,
        }),
      );
    },
    { deep: true },
  );

  function toggleFaction(faction: ExtractFactionFilter): void {
    const idx = extractFactions.value.indexOf(faction);
    if (idx === -1) {
      extractFactions.value = [...extractFactions.value, faction];
    } else {
      extractFactions.value = extractFactions.value.filter((f) => f !== faction);
    }
  }

  function isFactionVisible(faction: ExtractFactionFilter | null): boolean {
    const f = faction ?? "shared";
    return extractFactions.value.includes(f);
  }

  return {
    apiLang,
    extractFactions,
    extractLabelMode,
    extractLabelSize,
    playerFollow,
    mapCode,
    overlayAlwaysOnTop,
    overlayClickThrough,
    overlayOpacity,
    overlayMapOpacity,
    overlayZoom,
    lockHotkey,
    zoomInHotkey,
    zoomOutHotkey,
    floorUpHotkey,
    floorDownHotkey,
    toggleFaction,
    isFactionVisible,
  };
});
