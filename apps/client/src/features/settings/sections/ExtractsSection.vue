<script setup lang="ts">
import { FACTION_COLORS } from '@shared/maps';
import { useMapSettingsStore, type ExtractFactionFilter } from '@/features/map/store';

const { extractFactions, extractLabelMode, extractLabelSize, edgeIndicators } =
  storeToRefs(useMapSettingsStore());
const { t } = useI18n();

const FACTION_OPTIONS: ReadonlyArray<{
  value: ExtractFactionFilter;
  color: string;
}> = [
  { value: 'pmc', color: FACTION_COLORS.pmc },
  { value: 'scav', color: FACTION_COLORS.scav },
  { value: 'shared', color: FACTION_COLORS.shared },
];

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
  <Fieldset :legend="t('extracts')">
    <div class="flex flex-col gap-1">
      <label
        v-for="opt in FACTION_OPTIONS"
        :key="opt.value"
        class="flex cursor-pointer items-center gap-3 rounded px-1 py-1 hover:bg-surface-800"
      >
        <Checkbox v-model="extractFactions" :value="opt.value" :input-id="'faction-' + opt.value" />
        <i class="pi pi-circle-fill text-xs" :style="{ color: opt.color }" aria-hidden="true" />
        <span class="text-sm">{{ t(`factions.${opt.value}`) }}</span>
      </label>
    </div>

    <div class="mt-3">
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

    <div class="mt-3">
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

    <div class="mt-3">
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm" for="extract-edge-indicators">{{ t('edgeIndicators') }}</label>
        <ToggleSwitch v-model="edgeIndicators" input-id="extract-edge-indicators" />
      </div>
      <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t('edgeIndicatorsHint') }}</p>
    </div>
  </Fieldset>
</template>
