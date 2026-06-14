<script setup lang="ts">
import { FACTION_COLORS } from '@shared/maps';
import { factionsForMap } from '@/features/map/data/extracts';
import { useMapSettingsStore, type ExtractFactionFilter } from '@/features/map/store';

const { mapCode, extractFactions } = storeToRefs(useMapSettingsStore());
const { t } = useI18n();

const FACTION_OPTIONS: ReadonlyArray<{
  value: ExtractFactionFilter;
  color: string;
}> = [
  { value: 'pmc', color: FACTION_COLORS.pmc },
  { value: 'scav', color: FACTION_COLORS.scav },
  { value: 'shared', color: FACTION_COLORS.shared },
  { value: 'transit', color: FACTION_COLORS.transit },
];

// Only offer factions that have at least one exit on the current map.
const options = computed(() => {
  const present = factionsForMap(mapCode.value);
  return FACTION_OPTIONS.filter((opt) => present.has(opt.value));
});
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-for="opt in options"
      :key="opt.value"
      class="hover:bg-surface-800 flex cursor-pointer items-center gap-3 rounded px-1 py-1"
    >
      <Checkbox v-model="extractFactions" :value="opt.value" :input-id="'faction-' + opt.value" />
      <i class="pi pi-circle-fill text-xs" :style="{ color: opt.color }" aria-hidden="true" />
      <span class="text-sm">{{ t(`factions.${opt.value}`) }}</span>
    </label>
  </div>
</template>
