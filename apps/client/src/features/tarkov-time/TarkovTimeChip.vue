<script setup lang="ts">
import { tarkovTime } from '@shared/tarkov-time';
import { useOverlayHeaderActive } from '@/features/overlay/composables/useOverlayHeaderActive';

// Optional current-map name, merged into this always-visible chip so "where am
// I" stays glanceable in every state (idle + locked) — the drag band only shows
// the name on hover. Empty string = clock only (browser / non-overlay context).
defineProps<{ mapDisplayName?: string }>();

// Non-interactive info chip — stays visible even when the overlay is locked
// (click-through), like the map itself. Ticks once a second.
const clock = ref(tarkovTime(Date.now()));
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => (clock.value = tarkovTime(Date.now())), 1000);
});
onBeforeUnmount(() => clearInterval(timer));

// Float in the top-left corner; slide down out of the way when the drag bar
// expands over the top, then back up when it collapses.
const { active: headerActive } = useOverlayHeaderActive();
</script>

<template>
  <!-- Slide via transform (composited), not `top` (layout) — matches the
       header's transform/opacity reveal so the two move in lockstep.
       translate-y-11 (44px) lands it at top-14 from the top-3 base. -->
  <!-- Outer wrapper is a 40px-tall flex row (= the settings button height) so
       the pill's vertical centre lines up with the status/settings cluster on
       the opposite corner; both anchor at the same safe-area top. -->
  <div
    class="sa-top sa-left pointer-events-none absolute z-[1000] flex h-10 items-center transition-transform duration-200 ease-out"
    :class="headerActive ? 'translate-y-11' : 'translate-y-0'"
    aria-hidden="true"
  >
    <span
      class="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md bg-surface-800/70 px-2 py-1 font-mono text-xs tabular-nums text-surface-0 backdrop-blur select-none"
    >
      <i class="pi pi-clock text-[10px] opacity-70" />
      <span>{{ clock.left }}</span>
      <span class="opacity-40">/</span>
      <span>{{ clock.right }}</span>
      <template v-if="mapDisplayName">
        <span class="mx-0.5 opacity-25">|</span>
        <span class="max-w-[8.75rem] truncate font-sans text-[11px] font-medium opacity-90">
          {{ mapDisplayName }}
        </span>
      </template>
    </span>
  </div>
</template>
