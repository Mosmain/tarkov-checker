<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useLeafletMap } from "./composables/useLeafletMap";
import { useWebSocket } from "./composables/useWebSocket";
import { fetchExtractsForMap } from "./api/tarkov-dev";
import { mapInfo, type TarkovMapCode } from "@shared/maps";

// TODO: drive currentMapCode from the raid store / WS raid-start event.
const currentMapCode: TarkovMapCode = "bigmap";
const currentMapInfo = mapInfo(currentMapCode);

const mapContainer = ref<HTMLElement | null>(null);
const { mapError, addExtractMarkers } = useLeafletMap(mapContainer, currentMapCode);

const extractsError = ref<string | null>(null);

onMounted(async () => {
  try {
    const result = await fetchExtractsForMap(currentMapCode);
    if (result) {
      addExtractMarkers(result.extracts);
    } else {
      extractsError.value = `tarkov.dev: no map matched nameId=${currentMapCode}`;
    }
  } catch (err) {
    extractsError.value = err instanceof Error ? err.message : String(err);
  }
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
      <span :class="['h-2.5 w-2.5 rounded-full', badgeClass]" aria-hidden="true" />
      <span class="rounded-md bg-black/60 px-2 py-1 text-xs text-neutral-100 backdrop-blur">
        ws: {{ status }}
      </span>
    </div>
  </div>
</template>
