<script setup lang="ts">
import { computed, ref } from "vue";
import { useLeafletMap } from "./composables/useLeafletMap";
import { useWebSocket } from "./composables/useWebSocket";

const mapContainer = ref<HTMLElement | null>(null);
useLeafletMap(mapContainer);

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
  <div class="relative h-screen w-screen">
    <div ref="mapContainer" class="absolute inset-0 z-0" />

    <div
      class="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center"
    >
      <span
        class="rounded-md bg-black/60 px-3 py-1 text-sm font-medium text-neutral-100 backdrop-blur"
      >
        Customs map placeholder
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
