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
const mapCodeSchema = z.string().refine((s): s is TarkovMapCode => s in TARKOV_MAPS);

const persistedSchema = z.object({
  apiLang: apiLangSchema,
  extractFactions: z.array(extractFactionSchema),
  extractLabelMode: labelModeSchema,
  extractLabelSize: labelSizeSchema.default("md"),
  playerFollow: playerFollowSchema.default("off"),
  mapCode: mapCodeSchema.default("bigmap"),
});

export type ApiLang = z.infer<typeof apiLangSchema>;
export type ExtractFactionFilter = z.infer<typeof extractFactionSchema>;
export type ExtractLabelMode = z.infer<typeof labelModeSchema>;
export type ExtractLabelSize = z.infer<typeof labelSizeSchema>;
export type PlayerFollow = z.infer<typeof playerFollowSchema>;

const DEFAULTS = {
  apiLang: "en" as const,
  extractFactions: ["pmc", "scav", "shared"] as const satisfies readonly ExtractFactionFilter[],
  extractLabelMode: "always" as const,
  extractLabelSize: "md" as const,
  playerFollow: "off" as const,
  mapCode: "bigmap" as const satisfies TarkovMapCode,
};

function defaultState(): z.infer<typeof persistedSchema> {
  return {
    apiLang: DEFAULTS.apiLang,
    extractFactions: [...DEFAULTS.extractFactions],
    extractLabelMode: DEFAULTS.extractLabelMode,
    extractLabelSize: DEFAULTS.extractLabelSize,
    playerFollow: DEFAULTS.playerFollow,
    mapCode: DEFAULTS.mapCode,
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

  watch(
    [apiLang, extractFactions, extractLabelMode, extractLabelSize, playerFollow, mapCode],
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
    toggleFaction,
    isFactionVisible,
  };
});
