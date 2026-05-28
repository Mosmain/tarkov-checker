<script setup lang="ts">
import { VISIBLE_MAP_CODES } from "@shared/maps";
import { useMapSettingsStore } from "@/features/map/store";
import { useExtractsCacheControl } from "@/features/server/composables/useExtractsCacheControl";

const { mapCode } = storeToRefs(useMapSettingsStore());
const { mapLabelFor } = useExtractsCacheControl();
const { t } = useI18n();

const mapOptions = computed(() =>
  VISIBLE_MAP_CODES.map((code) => ({ value: code, label: mapLabelFor(code) })),
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
