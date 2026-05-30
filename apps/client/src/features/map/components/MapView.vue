<script setup lang="ts">
import { useLeafletMap } from '../composables/useLeafletMap';
import { useMapLayers } from '../layers/registry';
import { useMapI18n } from '../composables/useMapI18n';
import { mapInfo, type TarkovMapCode } from '@shared/maps';
import FloorSwitcher from './FloorSwitcher.vue';

const props = defineProps<{
  mapCode: TarkovMapCode;
}>();

const emit = defineEmits<{
  (e: 'mapName', name: string): void;
  (e: 'mapError', err: string | null): void;
}>();

const { locale } = useI18n();
const { localizedMapName } = useMapI18n();

const info = mapInfo(props.mapCode);
const mapContainer = ref<HTMLElement | null>(null);

const {
  map,
  initialZoom,
  mapError,
  currentFloor,
  setActiveFloor,
  zoomIn,
  zoomOut,
  nextFloor,
  prevFloor,
  reload,
} = useLeafletMap(mapContainer, props.mapCode);

for (const layer of useMapLayers().value) {
  layer.mount({ map, mapCode: props.mapCode, mapInfo: info, initialZoom });
}

const hasFloors = computed(() => info.floors.length > 1);

defineExpose({ zoomIn, zoomOut, nextFloor, prevFloor, reload });

watch(
  locale,
  () => {
    emit('mapName', localizedMapName(props.mapCode));
  },
  { immediate: true },
);
watch(mapError, (err) => emit('mapError', err));
</script>

<template>
  <div ref="mapContainer" class="absolute inset-0 z-0" />
  <div v-if="hasFloors" class="absolute bottom-3 left-3 z-[1000]">
    <FloorSwitcher :floors="info.floors" :current="currentFloor" @select="setActiveFloor" />
  </div>
</template>
