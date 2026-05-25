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
      return "bg-success";
    case "connecting":
      return "bg-warning";
    case "closed":
      return "bg-error";
    default:
      return "bg-base-content/30";
  }
});
</script>

<template>
  <div class="relative h-screen w-screen bg-base-100 text-base-content">
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
        class="inline-flex items-center gap-2 rounded-md bg-base-300/70 px-3 py-1 text-sm font-medium text-base-content backdrop-blur"
      >
        <span
          :class="['h-2 w-2 rounded-full', badgeClass]"
          :title="'ws: ' + status"
          aria-hidden="true"
        />
        {{ mapDisplayName }}
      </span>
    </div>

    <div
      v-if="mapError || extractsError"
      class="pointer-events-none absolute top-14 inset-x-3 z-[1000] flex flex-col items-center gap-1"
    >
      <div
        v-if="mapError"
        class="alert alert-error alert-sm w-auto py-1 text-xs backdrop-blur"
      >
        Map load error: {{ mapError }}
      </div>
      <div
        v-if="extractsError"
        class="alert alert-warning alert-sm w-auto py-1 text-xs backdrop-blur"
      >
        Extracts: {{ extractsError }}
      </div>
    </div>

    <div class="absolute bottom-3 right-3 z-[1000]">
      <SettingsPanel />
    </div>
  </div>
</template>
