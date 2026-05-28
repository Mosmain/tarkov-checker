<script setup lang="ts">
import { useLeafletMap } from '../composables/useLeafletMap';
import { fetchExtractsForMap } from '../api/tarkov-dev';
import { mapInfo, type TarkovMapCode } from '@shared/maps';
import { useMapSettingsStore } from '../store';
import { useI18nStore } from '@/features/i18n/store';
import { useServerEvent } from '@/features/server/composables/useServerEvents';
import { provideMapController } from '../composables/useMapController';
import FloorSwitcher from './FloorSwitcher.vue';

const props = defineProps<{
  mapCode: TarkovMapCode;
}>();

const emit = defineEmits<{
  (e: 'mapName', name: string): void;
  (e: 'mapError', err: string | null): void;
  (e: 'extractsError', err: string | null): void;
}>();

const { apiLang } = storeToRefs(useI18nStore());
const { extractFactions, extractLabelMode, extractLabelSize, playerFollow } =
  storeToRefs(useMapSettingsStore());

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
  zoomIn,
  zoomOut,
  nextFloor,
  prevFloor,
} = useLeafletMap(mapContainer, props.mapCode);

const hasFloors = computed(() => info.floors.length > 1);

// Publish imperative actions to ancestors via provide/inject so OverlayView's
// hotkeys can drive the map without ref-forwarding through every wrapper.
provideMapController({ zoomIn, zoomOut, nextFloor, prevFloor });

emit('mapName', info.displayName);
watch(mapError, (err) => emit('mapError', err));

useServerEvent('position', (msg) => {
  setPlayerPosition({ x: msg.x, y: msg.y, z: msg.z }, msg.yaw ?? null);
});

async function loadExtracts(): Promise<void> {
  emit('extractsError', null);
  try {
    const result = await fetchExtractsForMap(props.mapCode, apiLang.value);
    if (result) {
      emit('mapName', result.name);
      addExtractMarkers(result.extracts);
    } else {
      emit('extractsError', `tarkov.dev: no map matched nameId=${props.mapCode}`);
    }
  } catch (err) {
    emit('extractsError', err instanceof Error ? err.message : String(err));
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
    <FloorSwitcher :floors="info.floors" :current="currentFloor" @select="setActiveFloor" />
  </div>
</template>
