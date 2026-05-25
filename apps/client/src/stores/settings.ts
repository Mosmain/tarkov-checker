import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { z } from "zod";
import { TARKOV_MAPS, type TarkovMapCode } from "@shared/maps";

const STORAGE_KEY = "tarkov-checker:settings:v1";

const apiLangSchema = z.enum(["en", "ru"]);
const extractFactionSchema = z.enum(["pmc", "scav", "shared"]);
const labelModeSchema = z.enum(["hover", "smart"]);
const mapCodeSchema = z
  .string()
  .refine((s): s is TarkovMapCode => s in TARKOV_MAPS);

const persistedSchema = z.object({
  apiLang: apiLangSchema,
  extractFactions: z.array(extractFactionSchema),
  extractsVisible: z.boolean(),
  extractLabelMode: labelModeSchema,
  // Defaulted so users coming from older builds keep their other settings.
  mapCode: mapCodeSchema.default("bigmap"),
});

export type ApiLang = z.infer<typeof apiLangSchema>;
export type ExtractFactionFilter = z.infer<typeof extractFactionSchema>;
export type ExtractLabelMode = z.infer<typeof labelModeSchema>;

const DEFAULTS = {
  apiLang: "en" as const,
  extractFactions: ["pmc", "scav", "shared"] as const satisfies readonly ExtractFactionFilter[],
  extractsVisible: true,
  extractLabelMode: "smart" as const,
  mapCode: "bigmap" as const satisfies TarkovMapCode,
};

function loadFromStorage(): z.infer<typeof persistedSchema> {
  if (typeof localStorage === "undefined") {
    return {
      apiLang: DEFAULTS.apiLang,
      extractFactions: [...DEFAULTS.extractFactions],
      extractsVisible: DEFAULTS.extractsVisible,
      extractLabelMode: DEFAULTS.extractLabelMode,
      mapCode: DEFAULTS.mapCode,
    };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      apiLang: DEFAULTS.apiLang,
      extractFactions: [...DEFAULTS.extractFactions],
      extractsVisible: DEFAULTS.extractsVisible,
      extractLabelMode: DEFAULTS.extractLabelMode,
      mapCode: DEFAULTS.mapCode,
    };
  }
  try {
    const parsed = persistedSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // fall through to defaults
  }
  return {
    apiLang: DEFAULTS.apiLang,
    extractFactions: [...DEFAULTS.extractFactions],
    extractsVisible: DEFAULTS.extractsVisible,
    extractLabelMode: DEFAULTS.extractLabelMode,
    mapCode: DEFAULTS.mapCode,
  };
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadFromStorage();

  const apiLang = ref<ApiLang>(initial.apiLang);
  const extractFactions = ref<ExtractFactionFilter[]>([...initial.extractFactions]);
  const extractsVisible = ref(initial.extractsVisible);
  const extractLabelMode = ref<ExtractLabelMode>(initial.extractLabelMode);
  const mapCode = ref<TarkovMapCode>(initial.mapCode);

  watch(
    [apiLang, extractFactions, extractsVisible, extractLabelMode, mapCode],
    () => {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          apiLang: apiLang.value,
          extractFactions: extractFactions.value,
          extractsVisible: extractsVisible.value,
          extractLabelMode: extractLabelMode.value,
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
    // Treat null faction as "shared" for filtering purposes.
    const f = faction ?? "shared";
    return extractFactions.value.includes(f);
  }

  return {
    apiLang,
    extractFactions,
    extractsVisible,
    extractLabelMode,
    mapCode,
    toggleFaction,
    isFactionVisible,
  };
});
