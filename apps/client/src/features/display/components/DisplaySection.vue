<script setup lang="ts">
import { useDisplayStore } from '../store';
import { useDisplayEnv } from '../composables/useDisplayEnv';
import { useFullscreenToggle } from '../composables/useFullscreenToggle';

const { t } = useI18n();
const { keepAwake, keepAwakeMode, keepAwakeActive } = storeToRefs(useDisplayStore());
const { isIos, isStandalone } = useDisplayEnv();
const { isFullscreen, isSupported: fsSupported, toggle: toggleFullscreen } = useFullscreenToggle();

// Hide the fullscreen row once installed as a PWA (already chrome-free).
const showFullscreenRow = computed(() => !isStandalone.value);
const fullscreenToggleable = computed(() => fsSupported.value && !isIos);

// ToggleSwitch bound to live fullscreen state — set just toggles, the getter
// reflects the real state once `fullscreenchange` fires (no desync flash).
const fullscreenModel = computed({
  get: () => isFullscreen.value,
  set: () => {
    void toggleFullscreen().catch(() => undefined);
  },
});

// Driven entirely off the keep-awake driver's store state (mode + active) — no
// separate navigator probe, so the status can't drift from the actual driver.
const keepAwakeStatusKey = computed(() => {
  if (!keepAwake.value) return 'display.keepAwakeHintOff';
  if (keepAwakeActive.value)
    return keepAwakeMode.value === 'video'
      ? 'display.keepAwakeStatusVideo'
      : 'display.keepAwakeStatusActive';
  if (keepAwakeMode.value === 'video') return 'display.keepAwakeStatusTap';
  if (keepAwakeMode.value === 'wakelock') return 'display.keepAwakeStatusBlocked';
  return 'display.keepAwakeHintOff';
});
</script>

<template>
  <div class="space-y-3">
    <div v-if="showFullscreenRow">
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm" for="display-fullscreen">{{ t('display.fullscreen') }}</label>
        <ToggleSwitch
          v-if="fullscreenToggleable"
          v-model="fullscreenModel"
          input-id="display-fullscreen"
        />
        <span v-else class="text-xs opacity-50">{{ t('display.fullscreenNA') }}</span>
      </div>
      <p v-if="!fullscreenToggleable && isIos" class="mt-1.5 text-[10px] leading-relaxed opacity-70">
        {{ t('display.iosHint') }}
      </p>
    </div>

    <div>
      <div class="flex items-center justify-between gap-3">
        <label class="text-sm" for="display-keep-awake">{{ t('display.keepAwake') }}</label>
        <ToggleSwitch v-model="keepAwake" input-id="display-keep-awake" />
      </div>
      <p class="mt-1.5 text-[10px] leading-relaxed opacity-70">{{ t(keepAwakeStatusKey) }}</p>
    </div>
  </div>
</template>
