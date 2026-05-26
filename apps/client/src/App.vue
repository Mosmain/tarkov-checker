<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import Message from "primevue/message";
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

const statusIconClass = computed(() => {
  switch (status.value) {
    case "open":
      return "pi pi-circle-fill text-green-500";
    case "connecting":
      return "pi pi-circle-fill text-amber-400 animate-pulse";
    case "closed":
      return "pi pi-times-circle text-red-500";
    default:
      return "pi pi-circle text-surface-500";
  }
});
</script>

<template>
  <div class="relative h-screen w-screen bg-surface-950 text-surface-0">
    <MapView
      :key="mapCode"
      :map-code="mapCode"
      :last-message="lastMessage"
      @map-name="mapDisplayName = $event"
      @map-error="mapError = $event"
      @extracts-error="extractsError = $event"
    />

    <div class="absolute top-3 right-3 z-[1000] flex items-center gap-2">
      <span
        class="pointer-events-none inline-flex items-center gap-2 rounded-md bg-surface-800/70 px-3 py-1 text-sm font-medium text-surface-0 backdrop-blur"
      >
        <i
          :class="['text-[10px]', statusIconClass]"
          :title="'ws: ' + status"
          aria-hidden="true"
        />
        {{ mapDisplayName }}
      </span>
      <SettingsPanel />
    </div>

    <div
      v-if="mapError || extractsError"
      class="pointer-events-none absolute top-14 inset-x-3 z-[1000] flex flex-col items-center gap-1"
    >
      <Message v-if="mapError" severity="error" size="small" :closable="false">
        Map load error: {{ mapError }}
      </Message>
      <Message v-if="extractsError" severity="warn" size="small" :closable="false">
        Extracts: {{ extractsError }}
      </Message>
    </div>
  </div>
</template>
