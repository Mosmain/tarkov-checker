<script setup lang="ts">
import { useOverlayStore } from '@/features/overlay/store';
import { useOverlaySync } from '@/features/overlay/composables/useOverlaySync';

const { alwaysOnTop: overlayAlwaysOnTop, zoom: overlayZoom } = storeToRefs(useOverlayStore());
const { opacityPercent, mapOpacityPercent, mapOpacityDisabled } = useOverlaySync();
const { t } = useI18n();

const overlayZoomOptions = computed(() => [
  { label: '75%', value: '75' as const },
  { label: '100%', value: '100' as const },
  { label: '125%', value: '125' as const },
  { label: '150%', value: '150' as const },
]);
</script>

<template>
  <Fieldset :legend="t('overlay.heading')">
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm" for="overlay-always-on-top">{{ t('overlay.alwaysOnTop') }}</label>
        <ToggleSwitch v-model="overlayAlwaysOnTop" input-id="overlay-always-on-top" />
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <label class="text-xs opacity-70" for="overlay-opacity">{{ t('overlay.opacity') }}</label>
          <span class="text-xs tabular-nums opacity-70">{{ opacityPercent }}%</span>
        </div>
        <Slider
          v-model="opacityPercent"
          :min="30"
          :max="100"
          :step="5"
          input-id="overlay-opacity"
          class="w-full"
        />
      </div>

      <div :class="mapOpacityDisabled ? 'opacity-50' : ''">
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <label class="text-xs opacity-70" for="overlay-map-opacity">
            {{ t('overlay.mapOpacity') }}
          </label>
          <span class="text-xs tabular-nums opacity-70">{{ mapOpacityPercent }}%</span>
        </div>
        <Slider
          v-model="mapOpacityPercent"
          :min="0"
          :max="100"
          :step="5"
          :disabled="mapOpacityDisabled"
          input-id="overlay-map-opacity"
          class="w-full"
        />
        <p v-if="mapOpacityDisabled" class="mt-1.5 text-[10px] leading-relaxed opacity-70">
          {{ t('overlay.mapOpacityHint') }}
        </p>
      </div>

      <div>
        <p class="mb-1.5 text-xs opacity-60">{{ t('overlay.zoom') }}</p>
        <SelectButton
          v-model="overlayZoom"
          :options="overlayZoomOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          class="w-full"
        />
      </div>
    </div>
  </Fieldset>
</template>
