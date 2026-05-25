import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { z } from "zod";

const STORAGE_KEY = "tarkov-checker:settings:v1";

const apiLangSchema = z.enum(["en", "ru"]);
const extractFactionSchema = z.enum(["pmc", "scav", "shared"]);
const labelModeSchema = z.enum(["hover", "smart"]);

const persistedSchema = z.object({
  apiLang: apiLangSchema,
  extractFactions: z.array(extractFactionSchema),
  extractsVisible: z.boolean(),
  extractLabelMode: labelModeSchema,
});

export type ApiLang = z.infer<typeof apiLangSchema>;
export type ExtractFactionFilter = z.infer<typeof extractFactionSchema>;
export type ExtractLabelMode = z.infer<typeof labelModeSchema>;

const DEFAULTS = {
  apiLang: "en" as const,
  extractFactions: ["pmc", "scav", "shared"] as const satisfies readonly ExtractFactionFilter[],
  extractsVisible: true,
  extractLabelMode: "smart" as const,
};

function loadFromStorage(): z.infer<typeof persistedSchema> {
  if (typeof localStorage === "undefined") {
    return {
      apiLang: DEFAULTS.apiLang,
      extractFactions: [...DEFAULTS.extractFactions],
      extractsVisible: DEFAULTS.extractsVisible,
      extractLabelMode: DEFAULTS.extractLabelMode,
    };
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      apiLang: DEFAULTS.apiLang,
      extractFactions: [...DEFAULTS.extractFactions],
      extractsVisible: DEFAULTS.extractsVisible,
      extractLabelMode: DEFAULTS.extractLabelMode,
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
  };
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadFromStorage();

  const apiLang = ref<ApiLang>(initial.apiLang);
  const extractFactions = ref<ExtractFactionFilter[]>([...initial.extractFactions]);
  const extractsVisible = ref(initial.extractsVisible);
  const extractLabelMode = ref<ExtractLabelMode>(initial.extractLabelMode);

  watch(
    [apiLang, extractFactions, extractsVisible, extractLabelMode],
    () => {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          apiLang: apiLang.value,
          extractFactions: extractFactions.value,
          extractsVisible: extractsVisible.value,
          extractLabelMode: extractLabelMode.value,
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
    toggleFaction,
    isFactionVisible,
  };
});
