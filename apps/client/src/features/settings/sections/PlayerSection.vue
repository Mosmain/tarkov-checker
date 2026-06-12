<script setup lang="ts">
import { useMapSettingsStore } from '@/features/map/store';

const { playerFollow } = storeToRefs(useMapSettingsStore());
const { t } = useI18n();
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <label class="text-sm" for="player-follow">{{ t('playerFollow') }}</label>
      <ToggleSwitch
        :model-value="playerFollow === 'on'"
        input-id="player-follow"
        @update:model-value="(v: boolean) => (playerFollow = v ? 'on' : 'off')"
      />
    </div>
    <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t('playerFollowHint') }}</p>
  </div>
</template>
