<script setup lang="ts">
import { VISIBLE_MAP_CODES } from '@shared/maps';
import { useMapSettingsStore } from '@/features/map/store';
import { useMapI18n } from '@/features/map/composables/useMapI18n';

const { mapCode, autoMapSwitch } = storeToRefs(useMapSettingsStore());
const { t } = useI18n();
const { localizedMapName } = useMapI18n();

const mapOptions = computed(() =>
  VISIBLE_MAP_CODES.map((code) => ({ value: code, label: localizedMapName(code) })),
);
const currentMapName = computed(() => localizedMapName(mapCode.value));

// Auto-switch is the common case (the game's log drives the map), so the 11-map
// list stays collapsed behind a disclosure when it's on. With auto-switch off
// the list is always shown — manual selection is the only way to change maps.
const manualOpen = ref(false);
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <label class="text-sm" for="map-auto-switch">{{ t('autoMapSwitch') }}</label>
      <ToggleSwitch v-model="autoMapSwitch" input-id="map-auto-switch" />
    </div>

    <button
      v-if="autoMapSwitch"
      type="button"
      class="border-surface-700 hover:bg-surface-800 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
      @click="manualOpen = !manualOpen"
    >
      <span class="truncate">{{ currentMapName }}</span>
      <i
        class="pi text-xs opacity-60"
        :class="manualOpen ? 'pi-chevron-up' : 'pi-chevron-down'"
      />
    </button>

    <Listbox
      v-if="!autoMapSwitch || manualOpen"
      v-model="mapCode"
      :options="mapOptions"
      option-label="label"
      option-value="value"
      :aria-label="t('map')"
      list-style="max-height:8rem"
      fluid
    />
  </div>
</template>
