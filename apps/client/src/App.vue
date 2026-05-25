<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useLeafletMap } from "./composables/useLeafletMap";
import { useWebSocket } from "./composables/useWebSocket";
import { fetchExtractsForMap } from "./api/tarkov-dev";
import SettingsPanel from "./components/SettingsPanel.vue";
import { mapInfo, type TarkovMapCode } from "@shared/maps";
import { useSettingsStore } from "./stores/settings";

// TODO: drive currentMapCode from the raid store / WS raid-start event.
const currentMapCode: TarkovMapCode = "bigmap";
const currentMapInfo = mapInfo(currentMapCode);

const settings = useSettingsStore();
const { apiLang, extractFactions, extractsVisible, extractLabelMode } = storeToRefs(settings);

const mapContainer = ref<HTMLElement | null>(null);
const { mapError, addExtractMarkers, setExtractFilter, setLabelMode } = useLeafletMap(
  mapContainer,
  currentMapCode,
);

const extractsError = ref<string | null>(null);

async function loadExtracts(): Promise<void> {
  extractsError.value = null;
  try {
    const result = await fetchExtractsForMap(currentMapCode, apiLang.value);
    if (result) {
      addExtractMarkers(result.extracts);
    } else {
      extractsError.value = `tarkov.dev: no map matched nameId=${currentMapCode}`;
    }
  } catch (err) {
    extractsError.value = err instanceof Error ? err.message : String(err);
  }
}

// Initial settings push happens before the first fetch so newly-created
// markers come up with the right filter/label mode immediately.
setExtractFilter(extractFactions.value, extractsVisible.value);
setLabelMode(extractLabelMode.value);
void loadExtracts();

watch(apiLang, () => {
  void loadExtracts();
});
watch([extractFactions, extractsVisible], () => {
  setExtractFilter(extractFactions.value, extractsVisible.value);
});
watch(extractLabelMode, (mode) => {
  setLabelMode(mode);
});

const wsUrl = `ws://${window.location.hostname}:3000/ws`;
const { status } = useWebSocket(wsUrl);

const badgeClass = computed(() => {
  switch (status.value) {
    case "open":
      return "bg-emerald-600";
    case "connecting":
      return "bg-amber-500";
    case "closed":
      return "bg-rose-600";
    default:
      return "bg-neutral-600";
  }
});
</script>

<template>
  <div class="relative h-screen w-screen bg-neutral-950">
    <div ref="mapContainer" class="absolute inset-0 z-0" />

    <div class="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <span
        class="rounded-md bg-black/60 px-3 py-1 text-sm font-medium text-neutral-100 backdrop-blur"
      >
        {{ currentMapInfo.displayName }}
      </span>
    </div>

    <div
      v-if="mapError || extractsError"
      class="pointer-events-none absolute inset-x-0 top-12 z-10 flex flex-col items-center gap-1"
    >
      <span
        v-if="mapError"
        class="rounded-md bg-rose-900/80 px-3 py-1 text-xs text-rose-50 backdrop-blur"
      >
        Map load error: {{ mapError }}
      </span>
      <span
        v-if="extractsError"
        class="rounded-md bg-amber-900/80 px-3 py-1 text-xs text-amber-50 backdrop-blur"
      >
        Extracts: {{ extractsError }}
      </span>
    </div>

    <div class="absolute bottom-3 right-3 z-10 flex items-center gap-2">
      <SettingsPanel />
      <div class="flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 backdrop-blur">
        <span :class="['h-2.5 w-2.5 rounded-full', badgeClass]" aria-hidden="true" />
        <span class="text-xs text-neutral-100">ws: {{ status }}</span>
      </div>
    </div>
  </div>
</template>
