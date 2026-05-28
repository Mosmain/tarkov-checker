import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { fetchAllExtracts, getCacheTimestamp, refreshExtracts } from "../api/tarkov-dev";
import { useSettingsStore } from "../stores/settings";
import { useUiText } from "../i18n";
import { TARKOV_MAPS, type TarkovMapCode } from "@shared/maps";

export interface UseExtractsCacheControl {
  mapLabelFor: (code: TarkovMapCode) => string;
  cacheRefreshing: Ref<boolean>;
  cacheError: Ref<string | null>;
  cacheRelativeAge: ComputedRef<string>;
  refreshCache: () => Promise<void>;
}

/**
 * Owns two related concerns that share the same /api/extracts fetch:
 *
 * - Localized display names for the map dropdown. Falls back to
 *   TARKOV_MAPS.displayName when the server is unreachable.
 * - Cache freshness indicator + manual refresh button.
 *
 * Bundled together because the underlying API layer dedups concurrent calls
 * — splitting these into two composables would double-fetch on mount.
 */
export function useExtractsCacheControl(): UseExtractsCacheControl {
  const { apiLang } = storeToRefs(useSettingsStore());
  const t = useUiText();

  const localizedMapNames = ref<Partial<Record<string, string>>>({});
  const cacheTimestamp = ref<number | null>(null);
  const cacheRefreshing = ref(false);
  const cacheError = ref<string | null>(null);

  function refreshCacheTimestamp(): void {
    cacheTimestamp.value = getCacheTimestamp(apiLang.value);
  }

  async function loadMapNames(): Promise<void> {
    try {
      const all = await fetchAllExtracts(apiLang.value);
      const byNameId: Record<string, string> = {};
      for (const entry of all) {
        byNameId[entry.nameId.toLowerCase()] = entry.name;
      }
      localizedMapNames.value = byNameId;
    } catch {
      // Fall back silently to TARKOV_MAPS.displayName.
    } finally {
      refreshCacheTimestamp();
    }
  }

  function mapLabelFor(code: TarkovMapCode): string {
    return localizedMapNames.value[code.toLowerCase()] ?? TARKOV_MAPS[code].displayName;
  }

  async function refreshCache(): Promise<void> {
    cacheRefreshing.value = true;
    cacheError.value = null;
    try {
      await refreshExtracts(apiLang.value);
      refreshCacheTimestamp();
    } catch (err) {
      cacheError.value = err instanceof Error ? err.message : String(err);
    } finally {
      cacheRefreshing.value = false;
    }
  }

  const cacheRelativeAge = computed(() => {
    const ts = cacheTimestamp.value;
    if (!ts) return t.value.cache.never;
    const ms = Date.now() - ts;
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "<1m";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
  });

  void loadMapNames();
  refreshCacheTimestamp();
  watch(apiLang, () => {
    void loadMapNames();
    refreshCacheTimestamp();
  });

  return {
    mapLabelFor,
    cacheRefreshing,
    cacheError,
    cacheRelativeAge,
    refreshCache,
  };
}
