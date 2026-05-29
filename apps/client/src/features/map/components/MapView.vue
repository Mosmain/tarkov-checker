<script setup lang="ts">
import { useLeafletMap } from '../composables/useLeafletMap';
import type { ExtractMarker } from '../composables/useExtractMarkers';
import { extractsForMap } from '../data/extracts';
import { mapInfo, type TarkovMapCode } from '@shared/maps';
import { useMapSettingsStore } from '../store';
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

const { t, te, locale } = useI18n();
const { extractFactions, extractLabelMode, extractLabelSize, playerFollow } =
  storeToRefs(useMapSettingsStore());

const info = mapInfo(props.mapCode);

/**
 * Localized map name with English fallback (same convention as MapSection).
 * `te` checks the key exists for the active locale without firing missing-
 * translation warns; if no translation is in place yet (e.g. a freshly added
 * map), the hardcoded English `displayName` from maps.ts still shows up.
 */
function localizedMapName(): string {
  const key = `mapNames.${props.mapCode}`;
  return te(key) ? t(key) : info.displayName;
}

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

// Re-emit the localized name whenever the active locale flips. `immediate`
// covers the initial mount; the same watch also handles the async resolution
// of the persisted locale (i18nStore.setLocale lazy-loads ru.json on first
// switch, so locale.value still reads 'en' for the first paint and updates
// once the import resolves).
watch(
  locale,
  () => {
    emit('mapName', localizedMapName());
  },
  { immediate: true },
);
watch(mapError, (err) => emit('mapError', err));

useServerEvent('position', (msg) => {
  setPlayerPosition({ x: msg.x, y: msg.y, z: msg.z }, msg.yaw ?? null);
});

/**
 * Static dataset → marker list. Multi-faction extracts (e.g. an exit usable
 * by both PMC and Scav) expand into one marker per faction at the same
 * position; useExtractMarkers' radial offset keeps their tooltips readable.
 * Names come from i18n — falls back to the stable key if a translation is
 * missing so a freshly fetched extract still renders something legible.
 */
function loadExtracts(): void {
  emit('extractsError', null);
  const data = extractsForMap(props.mapCode);
  if (!data) {
    emit('extractsError', `No extracts dataset for mapCode=${props.mapCode}`);
    return;
  }
  const markers: ExtractMarker[] = [];
  for (const ex of data) {
    const i18nKey = `extractNames.${props.mapCode}.${ex.key}`;
    const name = t(i18nKey);
    const displayName = name === i18nKey ? ex.key : name;
    for (const faction of ex.factions) {
      markers.push({ name: displayName, faction, position: ex.position });
    }
  }
  addExtractMarkers(markers);
}

setExtractFilter(extractFactions.value);
setLabelMode(extractLabelMode.value);
setLabelSize(extractLabelSize.value);
setPlayerFollow(playerFollow.value);
// Defer to onMounted: useLeafletMap registers its own onMounted to create
// the L.Map instance synchronously at the top of that hook, before any
// await. Vue runs onMounted callbacks in registration order, so by the
// time this one fires, map.value is set and addExtractMarkers can attach
// markers without hitting its `if (!map.value) return` guard.
onMounted(loadExtracts);

// Locale flips → rebuild markers so tooltips pick up the new language.
// (Map name re-emit is handled by the immediate watch above.)
watch(locale, () => {
  loadExtracts();
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
