<script setup lang="ts">
import { useMapSettingsStore } from '@/features/map/store';

// Faction toggles deliberately live OUTSIDE this component — they're the
// always-visible ExtractFactionFilter.vue in the rail flyout; only the
// rarely-touched knobs stay behind the gear.
const { extractLabelMode, extractLabelSize, edgeIndicators } =
  storeToRefs(useMapSettingsStore());
const { t } = useI18n();

const labelModeOptions = computed(() => [
  { label: t('labelHover'), value: 'hover' as const },
  { label: t('labelAlways'), value: 'always' as const },
]);

const labelSizeOptions = computed(() => [
  { label: t('labelSizes.sm'), value: 'sm' as const },
  { label: t('labelSizes.md'), value: 'md' as const },
  { label: t('labelSizes.lg'), value: 'lg' as const },
]);
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="mb-1.5 text-xs opacity-60">{{ t('labels') }}</p>
      <SelectButton
        v-model="extractLabelMode"
        :options="labelModeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        fluid
      />
      <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t('labelHint') }}</p>
    </div>

    <div>
      <p class="mb-1.5 text-xs opacity-60">{{ t('labelSize') }}</p>
      <SelectButton
        v-model="extractLabelSize"
        :options="labelSizeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        fluid
      />
    </div>

    <div>
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm" for="extract-edge-indicators">{{ t('edgeIndicators') }}</label>
        <ToggleSwitch v-model="edgeIndicators" input-id="extract-edge-indicators" />
      </div>
      <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t('edgeIndicatorsHint') }}</p>
    </div>
  </div>
</template>
