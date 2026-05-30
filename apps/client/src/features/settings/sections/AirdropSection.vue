<script setup lang="ts">
import { useAirdropStore, DROP_MARKER_RADIUS_RANGE } from '@/features/airdrop/store';

const { dropMarkerRadius } = storeToRefs(useAirdropStore());
const { t } = useI18n();
</script>

<template>
  <Fieldset :legend="t('airdrop.settingsHeading')">
    <div>
      <div class="mb-1.5 flex items-center justify-between gap-3">
        <label class="text-xs opacity-70" for="airdrop-radius">{{ t('airdrop.radius') }}</label>
        <span class="text-xs tabular-nums opacity-70">{{ dropMarkerRadius }}m</span>
      </div>
      <Slider
        v-model="dropMarkerRadius"
        :min="DROP_MARKER_RADIUS_RANGE.min"
        :max="DROP_MARKER_RADIUS_RANGE.max"
        :step="1"
        input-id="airdrop-radius"
        class="w-full"
      />
      <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t('airdrop.radiusHint') }}</p>
    </div>
  </Fieldset>
</template>
