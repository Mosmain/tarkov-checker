<script setup lang="ts">
import { useDisplayEnv } from '../composables/useDisplayEnv';
import { useFullscreenToggle } from '../composables/useFullscreenToggle';

const { t } = useI18n();
const { isIos, isStandalone, isMobileViewport, isTouch } = useDisplayEnv();
const { isFullscreen, isSupported, toggle } = useFullscreenToggle();

// Mobile/touch browser only: desktop has F11, and an installed PWA is already
// chrome-free. On iOS the Fullscreen API is absent, so the button becomes a
// "Add to Home Screen" hint instead.
const show = computed(
  () =>
    !isStandalone.value &&
    (isMobileViewport.value || isTouch.value) &&
    (isSupported.value || isIos),
);

const iosHint = ref<{ toggle: (e: Event) => void } | null>(null);

function onClick(event: MouseEvent): void {
  // requestFullscreen rejects when disallowed (e.g. embedded in an iframe);
  // swallow it — there's nothing actionable and no user-facing failure.
  if (isSupported.value && !isIos) void toggle().catch(() => undefined);
  else if (isIos) iosHint.value?.toggle(event);
}

const icon = computed(() => {
  if (isIos && !isSupported.value) return 'pi pi-mobile';
  return isFullscreen.value ? 'pi pi-window-minimize' : 'pi pi-window-maximize';
});
</script>

<template>
  <template v-if="show">
    <Button
      rounded
      severity="secondary"
      class="!bg-surface-800/80 hover:!bg-surface-800 !border-surface-700 backdrop-blur"
      :aria-label="t('display.fullscreen')"
      @click="onClick"
    >
      <template #icon>
        <i :class="['text-sm', icon]" aria-hidden="true" />
      </template>
    </Button>
    <Popover ref="iosHint">
      <p class="max-w-[15rem] text-xs leading-relaxed">{{ t('display.iosHint') }}</p>
    </Popover>
  </template>
</template>
