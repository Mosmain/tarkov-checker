<script setup lang="ts">
import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useLeafletMap } from "../composables/useLeafletMap";
import { fetchExtractsForMap } from "../api/tarkov-dev";
import { mapInfo, type TarkovMapCode } from "@shared/maps";
import type { ServerMessage } from "@shared/ws-messages";
import { useSettingsStore } from "../stores/settings";

const props = defineProps<{
  mapCode: TarkovMapCode;
  lastMessage: ServerMessage | null;
}>();

const emit = defineEmits<{
  (e: "mapName", name: string): void;
  (e: "mapError", err: string | null): void;
  (e: "extractsError", err: string | null): void;
}>();

const settings = useSettingsStore();
const { apiLang, extractFactions, extractsVisible, extractLabelMode } = storeToRefs(settings);

const mapContainer = ref<HTMLElement | null>(null);
const {
  mapError,
  addExtractMarkers,
  setExtractFilter,
  setLabelMode,
  setPlayerPosition,
  clearPlayerPosition,
} = useLeafletMap(mapContainer, props.mapCode);

emit("mapName", mapInfo(props.mapCode).displayName);
watch(mapError, (err) => emit("mapError", err));

const PLAYER_STALE_AFTER_MS = 90_000;
let playerStaleTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.lastMessage,
  (msg) => {
    if (!msg || msg.type !== "position") return;
    setPlayerPosition({ x: msg.x, y: msg.y, z: msg.z }, msg.yaw ?? null);
    if (playerStaleTimer !== null) clearTimeout(playerStaleTimer);
    playerStaleTimer = setTimeout(() => {
      clearPlayerPosition();
      playerStaleTimer = null;
    }, PLAYER_STALE_AFTER_MS);
  },
);

async function loadExtracts(): Promise<void> {
  emit("extractsError", null);
  try {
    const result = await fetchExtractsForMap(props.mapCode, apiLang.value);
    if (result) {
      emit("mapName", result.name);
      addExtractMarkers(result.extracts);
    } else {
      emit("extractsError", `tarkov.dev: no map matched nameId=${props.mapCode}`);
    }
  } catch (err) {
    emit("extractsError", err instanceof Error ? err.message : String(err));
  }
}

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
</script>

<template>
  <div ref="mapContainer" class="absolute inset-0 z-0" />
</template>
