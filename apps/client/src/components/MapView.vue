<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useLeafletMap } from "../composables/useLeafletMap";
import { fetchExtractsForMap } from "../api/tarkov-dev";
import { mapInfo, type TarkovMapCode } from "@shared/maps";
import type { ServerMessage } from "@shared/ws-messages";
import { useSettingsStore } from "../stores/settings";
import FloorSwitcher from "./FloorSwitcher.vue";

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
const { apiLang, extractFactions, extractLabelMode, extractLabelSize, playerFollow } =
  storeToRefs(settings);

const info = mapInfo(props.mapCode);

const mapContainer = ref<HTMLElement | null>(null);
const {
  mapError,
  currentFloor,
  addExtractMarkers,
  setExtractFilter,
  setLabelMode,
  setLabelSize,
  setPlayerFollow,
  setActiveFloor,
  setPlayerPosition,
} = useLeafletMap(mapContainer, props.mapCode);

const hasFloors = computed(() => info.floors.length > 1);

emit("mapName", info.displayName);
watch(mapError, (err) => emit("mapError", err));

watch(
  () => props.lastMessage,
  (msg) => {
    if (!msg || msg.type !== "position") return;
    setPlayerPosition({ x: msg.x, y: msg.y, z: msg.z }, msg.yaw ?? null);
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

setExtractFilter(extractFactions.value);
setLabelMode(extractLabelMode.value);
setLabelSize(extractLabelSize.value);
setPlayerFollow(playerFollow.value);
void loadExtracts();

watch(apiLang, () => {
  void loadExtracts();
});
watch(extractFactions, () => {
  setExtractFilter(extractFactions.value);
});
watch(extractLabelMode, (mode) => {
  setLabelMode(mode);
});
watch(extractLabelSize, (size) => {
  setLabelSize(size);
});
watch(playerFollow, (mode) => {
  setPlayerFollow(mode);
});
</script>

<template>
  <div ref="mapContainer" class="absolute inset-0 z-0" />
  <div v-if="hasFloors" class="absolute bottom-3 left-3 z-[1000]">
    <FloorSwitcher
      :floors="info.floors"
      :current="currentFloor"
      @select="setActiveFloor"
    />
  </div>
</template>
