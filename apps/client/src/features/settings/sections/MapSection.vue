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
</script>

<template>
  <div class="space-y-3">
    <Select
      v-model="mapCode"
      :options="mapOptions"
      option-label="label"
      option-value="value"
      :aria-label="t('map')"
      fluid
    />
    <div class="flex items-center justify-between gap-3">
      <label class="text-sm" for="map-auto-switch">{{ t('autoMapSwitch') }}</label>
      <ToggleSwitch v-model="autoMapSwitch" input-id="map-auto-switch" />
    </div>
    <p class="text-[10px] leading-relaxed opacity-70">{{ t('autoMapSwitchHint') }}</p>
  </div>
</template>
