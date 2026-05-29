<script setup lang="ts">
import { VISIBLE_MAP_CODES, TARKOV_MAPS, type TarkovMapCode } from '@shared/maps';
import { useMapSettingsStore } from '@/features/map/store';

const { mapCode } = storeToRefs(useMapSettingsStore());
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
    <Select
      v-model="mapCode"
      :options="mapOptions"
      option-label="label"
      option-value="value"
      fluid
    />
  </Fieldset>
</template>
