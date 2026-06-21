<script setup lang="ts">
import { VISIBLE_MAP_CODES, type TarkovMapCode } from '@shared/maps';
import { useMapSettingsStore } from '@/features/map/store';
import { useMapI18n } from '@/features/map/composables/useMapI18n';

const { t } = useI18n();

// Right-click-the-map-name → quick map switcher. Same teleported-popup pattern
// as MapQuickMenu (open(x,y) / outside-click / Esc / blur dismissal).
const { mapCode } = storeToRefs(useMapSettingsStore());
const { localizedMapName } = useMapI18n();

const position = ref<{ x: number; y: number } | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const PANEL_W = 208;
const PANEL_H = 360;
const EDGE_GAP = 8;

const maps = computed(() =>
  VISIBLE_MAP_CODES.map((code) => ({ code, name: localizedMapName(code) })),
);

function open(x: number, y: number): void {
  position.value = {
    x: Math.max(EDGE_GAP, Math.min(x, window.innerWidth - PANEL_W - EDGE_GAP)),
    y: Math.max(EDGE_GAP, Math.min(y, window.innerHeight - PANEL_H - EDGE_GAP)),
  };
}

function close(): void {
  position.value = null;
}

function select(code: TarkovMapCode): void {
  mapCode.value = code;
  close();
}

onClickOutside(panelRef, () => close());
useEventListener(window, 'keydown', (e) => {
  if (e.key === 'Escape' && position.value) close();
});
useEventListener(window, 'blur', () => close());
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'hidden') close();
});

defineExpose({ open, close });
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="position"
        ref="panelRef"
        class="fixed z-[2000] max-h-[80vh] w-52 origin-top-left overflow-y-auto rounded-md border border-surface-700 bg-surface-900/95 p-1 shadow-xl backdrop-blur"
        :style="{ left: position.x + 'px', top: position.y + 'px' }"
        role="menu"
        :aria-label="t('a11y.selectMap')"
      >
        <button
          v-for="m in maps"
          :key="m.code"
          type="button"
          role="menuitemradio"
          :aria-checked="m.code === mapCode"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-800"
          :class="m.code === mapCode ? 'font-medium text-primary-400' : ''"
          @click="select(m.code)"
        >
          <i
            class="pi text-[10px]"
            :class="m.code === mapCode ? 'pi-check' : 'pi-circle'"
            aria-hidden="true"
          />
          <span class="truncate">{{ m.name }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>
