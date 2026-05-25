<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import MapView from "./components/MapView.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import { useWebSocket } from "./composables/useWebSocket";
import { useSettingsStore } from "./stores/settings";

const settings = useSettingsStore();
const { mapCode } = storeToRefs(settings);

const mapDisplayName = ref<string>("…");
const mapError = ref<string | null>(null);
const extractsError = ref<string | null>(null);

const wsUrl = `ws://${window.location.hostname}:3000/ws`;
const { status, lastMessage } = useWebSocket(wsUrl);

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
    <MapView
      :key="mapCode"
      :map-code="mapCode"
      :last-message="lastMessage"
      @map-name="mapDisplayName = $event"
      @map-error="mapError = $event"
      @extracts-error="extractsError = $event"
    />

    <div class="pointer-events-none absolute top-3 right-3 z-[1000]">
      <span
        class="rounded-md bg-black/60 px-3 py-1 text-sm font-medium text-neutral-100 backdrop-blur"
      >
        {{ mapDisplayName }}
      </span>
    </div>

    <div
      v-if="mapError || extractsError"
      class="pointer-events-none absolute top-14 inset-x-3 z-[1000] flex flex-col items-center gap-1"
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

    <div class="absolute bottom-3 right-3 z-[1000] flex items-center gap-2">
      <SettingsPanel />
      <div class="flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 backdrop-blur">
        <span :class="['h-2.5 w-2.5 rounded-full', badgeClass]" aria-hidden="true" />
        <span class="text-xs text-neutral-100">ws: {{ status }}</span>
      </div>
    </div>
  </div>
</template>
