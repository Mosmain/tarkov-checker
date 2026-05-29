<script setup lang="ts">
import { VISIBLE_MAP_CODES, TARKOV_MAPS, type TarkovMapCode } from '@shared/maps';
import { useMapSettingsStore } from '@/features/map/store';

const { mapCode, autoMapSwitch } = storeToRefs(useMapSettingsStore());
const { t, te } = useI18n();

/**
 * Localized map name with a graceful fallback. `te` checks whether a key
 * exists for the active locale (without firing missing-translation warns),
 * and we drop back to the hardcoded English `displayName` from maps.ts
 * when no translation has been added yet — so a freshly-added map still
 * renders something legible before the operator updates the locale files.
 */
function mapLabel(code: TarkovMapCode): string {
  const key = `mapNames.${code}`;
  return te(key) ? t(key) : TARKOV_MAPS[code].displayName;
}

const mapOptions = computed(() =>
  VISIBLE_MAP_CODES.map((code) => ({ value: code, label: mapLabel(code) })),
);
</script>

<template>
  <Fieldset :legend="t('map')">
    <div class="space-y-3">
      <Select
        v-model="mapCode"
        :options="mapOptions"
        option-label="label"
        option-value="value"
        fluid
      />
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm" for="map-auto-switch">{{ t('autoMapSwitch') }}</label>
        <ToggleSwitch v-model="autoMapSwitch" input-id="map-auto-switch" />
      </div>
      <p class="text-[10px] leading-relaxed opacity-50">{{ t('autoMapSwitchHint') }}</p>
    </div>
  </Fieldset>
</template>
