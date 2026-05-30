<script setup lang="ts">
import { useLeafletMap } from '../composables/useLeafletMap';
import type { ExtractMarker } from '../layers/extracts/useExtractMarkers';
import { extractsForMap } from '../data/extracts';
import { mapInfo, type TarkovMapCode } from '@shared/maps';
import { useMapSettingsStore } from '../store';
import { useServerEvent } from '@/features/server/composables/useServerEvents';
import { useAirdropMarker } from '@/features/airdrop/composables/useAirdropMarker';
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
  map,
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

useAirdropMarker(map);

const hasFloors = computed(() => info.floors.length > 1);

// Expose imperative actions to the parent (index.vue) so its globally-bound
// hotkeys can drive the map. provide/inject doesn't work here — it only
// flows ancestor → descendant, and the hotkey owner is our parent, not a
// child. Same pattern as MapQuickMenu.open/close in App.vue.
defineExpose({ zoomIn, zoomOut, nextFloor, prevFloor });

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
 * Position bucket size for merging co-located extracts: any two exits
 * whose `(x, z)` round to the same bucket cell get fused into one composite
 * marker. Co-located but semantically distinct exits (Customs has dorms
 * V-Ex + old road gate ~1m apart) become a multi-faction marker with a
 * multi-row tooltip — one name per faction — instead of two stacked
 * single-faction icons.
 */
const COLOCATION_TOLERANCE = 2;

interface RawExtract {
  key: string;
  factions: ReadonlyArray<'pmc' | 'scav' | 'shared'>;
  position: { x: number; y: number; z: number };
}

/**
 * Static dataset → marker list. Steps: (1) localize each extract's name
 * via i18n with key-as-fallback; (2) bucket extracts by (x, z) so co-
 * located ones merge into a single composite marker; (3) flatten each
 * raw extract's `factions[]` into per-faction entries on the merged
 * marker so the icon and the tooltip can render them independently.
 */
function loadExtracts(): void {
  emit('extractsError', null);
  const data = extractsForMap(props.mapCode);
  if (!data) {
    emit('extractsError', `No extracts dataset for mapCode=${props.mapCode}`);
    return;
  }

  function nameOf(ex: RawExtract): string {
    const i18nKey = `extractNames.${props.mapCode}.${ex.key}`;
    const v = t(i18nKey);
    return v === i18nKey ? ex.key : v;
  }

  const buckets = new Map<string, RawExtract[]>();
  for (const ex of data) {
    const bx = Math.round(ex.position.x / COLOCATION_TOLERANCE);
    const bz = Math.round(ex.position.z / COLOCATION_TOLERANCE);
    const key = `${bx},${bz}`;
    const group = buckets.get(key);
    if (group) group.push(ex);
    else buckets.set(key, [ex]);
  }

  const markers: ExtractMarker[] = [];
  for (const group of buckets.values()) {
    const entries: { faction: 'pmc' | 'scav' | 'shared'; name: string }[] = [];
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const ex of group) {
      const name = nameOf(ex);
      for (const faction of ex.factions) entries.push({ faction, name });
      sumX += ex.position.x;
      sumY += ex.position.y;
      sumZ += ex.position.z;
    }
    markers.push({
      entries,
      position: { x: sumX / group.length, y: sumY / group.length, z: sumZ / group.length },
    });
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
