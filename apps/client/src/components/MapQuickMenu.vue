<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { onClickOutside, useEventListener } from "@vueuse/core";
import Slider from "primevue/slider";
import { useSettingsStore } from "../stores/settings";
import { useUiText } from "../i18n";
import { opacityPercentBinding } from "../utils/opacity";

const settings = useSettingsStore();
const { overlayOpacity, overlayMapOpacity } = storeToRefs(settings);
const t = useUiText();

const position = ref<{ x: number; y: number } | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const opacityPercent = opacityPercentBinding(overlayOpacity, 30, 100);
const mapOpacityPercent = opacityPercentBinding(overlayMapOpacity, 0, 100);
const mapOpacityDisabled = computed(() => overlayOpacity.value >= 1);

/** Panel dimensions used to clamp the opening position to the viewport. The
 * Slider component is reactive in height, so these are a generous overestimate
 * — fine for keeping the menu on-screen near edges. */
const PANEL_W = 240;
const PANEL_H = 180;
const EDGE_GAP = 8;

function open(x: number, y: number): void {
  position.value = {
    x: Math.max(EDGE_GAP, Math.min(x, window.innerWidth - PANEL_W - EDGE_GAP)),
    y: Math.max(EDGE_GAP, Math.min(y, window.innerHeight - PANEL_H - EDGE_GAP)),
  };
}

function close(): void {
  position.value = null;
}

// Outside-click dismissal (Slider thumb events are inside the panel, so drag
// continues to work normally).
onClickOutside(panelRef, () => close());

// Esc to dismiss.
useEventListener(window, "keydown", (e) => {
  if (e.key === "Escape" && position.value) close();
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
        class="fixed z-[2000] w-60 origin-top-left rounded-md border border-surface-700 bg-surface-900/95 p-3 shadow-xl backdrop-blur"
        :style="{ left: position.x + 'px', top: position.y + 'px' }"
        role="menu"
      >
        <p class="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-60">
          {{ t.overlay.quickMenuTitle }}
        </p>

        <div class="space-y-3">
          <div>
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <label class="text-xs opacity-70" for="quick-overlay-opacity">
                {{ t.overlay.opacity }}
              </label>
              <span class="text-xs tabular-nums opacity-70">{{ opacityPercent }}%</span>
            </div>
            <Slider
              v-model="opacityPercent"
              :min="30"
              :max="100"
              :step="5"
              input-id="quick-overlay-opacity"
              class="w-full"
            />
          </div>

          <div :class="mapOpacityDisabled ? 'opacity-50' : ''">
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <label class="text-xs opacity-70" for="quick-overlay-map-opacity">
                {{ t.overlay.mapOpacity }}
              </label>
              <span class="text-xs tabular-nums opacity-70">{{ mapOpacityPercent }}%</span>
            </div>
            <Slider
              v-model="mapOpacityPercent"
              :min="0"
              :max="100"
              :step="5"
              :disabled="mapOpacityDisabled"
              input-id="quick-overlay-map-opacity"
              class="w-full"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
