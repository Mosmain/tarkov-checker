<script setup lang="ts">
import { useLeafletMap } from '../composables/useLeafletMap';
import { useMapLayers } from '../layers/registry';
import { useLayerVisibility } from '../composables/useLayerVisibility';
import { useMapI18n } from '../composables/useMapI18n';
import { mapInfo, type TarkovMapCode } from '@shared/maps';
import LayerRail from './LayerRail.vue';

const props = defineProps<{
  mapCode: TarkovMapCode;
}>();

const emit = defineEmits<{
  (e: 'mapName', name: string): void;
  (e: 'mapError', err: string | null): void;
}>();

const { t, locale } = useI18n();
const { localizedMapName } = useMapI18n();

const info = mapInfo(props.mapCode);
const mapContainer = ref<HTMLElement | null>(null);

// Text alternative for the visual map (WCAG 1.1.1). role="application" tells
// screen readers to pass arrow keys through to Leaflet's keyboard pan/zoom.
const mapLabel = computed(() => t('a11y.mapRegion', { name: localizedMapName(props.mapCode) }));

const {
  map,
  initialZoom,
  mapError,
  currentFloor,
  setActiveFloor,
  zoomIn,
  zoomOut,
  floorUp,
  floorDown,
  reload,
} = useLeafletMap(mapContainer, props.mapCode);

for (const layer of useMapLayers().value) {
  layer.mount({
    map,
    mapCode: props.mapCode,
    mapInfo: info,
    initialZoom,
    visible: useLayerVisibility(layer.id),
  });
}

// Alt + mouse wheel over the map steps floors instead of zooming (multi-floor
// maps only). Captured before Leaflet's own wheel handler so it never zooms;
// lightly throttled so a trackpad doesn't skip several floors at once.
let lastFloorWheel = 0;
useEventListener(
  mapContainer,
  'wheel',
  (e: WheelEvent) => {
    if (!e.altKey || info.floors.length <= 1) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const now = performance.now();
    if (now - lastFloorWheel < 120) return;
    lastFloorWheel = now;
    const floors = info.floors;
    const i = floors.findIndex((f) => f.id === currentFloor.value);
    const target = floors[(i < 0 ? 0 : i) + (e.deltaY < 0 ? -1 : 1)];
    if (target) setActiveFloor(target.id);
  },
  { capture: true, passive: false },
);

defineExpose({ zoomIn, zoomOut, floorUp, floorDown, reload });

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
  <div ref="mapContainer" role="application" :aria-label="mapLabel" class="absolute inset-0 z-0" />
  <LayerRail :floors="info.floors" :current-floor="currentFloor" @select-floor="setActiveFloor" />
</template>
