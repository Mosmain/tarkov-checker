<script setup lang="ts">
import { useMapSettingsStore } from '@/features/map/store';

const { playerFollow } = storeToRefs(useMapSettingsStore());
const { t } = useI18n();

const playerFollowOptions = computed(() => [
  { label: t('playerFollowOptions.off'), value: 'off' as const },
  { label: t('playerFollowOptions.sm'), value: 'sm' as const },
  { label: t('playerFollowOptions.md'), value: 'md' as const },
  { label: t('playerFollowOptions.lg'), value: 'lg' as const },
]);
</script>

<template>
  <Fieldset :legend="t('player')">
    <p class="mb-1.5 text-xs opacity-60">{{ t('playerFollow') }}</p>
    <SelectButton
      v-model="playerFollow"
      :options="playerFollowOptions"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      size="small"
      class="w-full"
    />
    <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t('playerFollowHint') }}</p>
  </Fieldset>
</template>
