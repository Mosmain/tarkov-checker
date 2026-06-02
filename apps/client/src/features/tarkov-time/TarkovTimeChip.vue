<script setup lang="ts">
import { tarkovTime } from '@shared/tarkov-time';
import { useOverlayHeaderActive } from '@/features/overlay/composables/useOverlayHeaderActive';

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
  <div
    class="pointer-events-none absolute left-3 z-[1000] inline-flex items-center gap-1.5 rounded-md bg-surface-800/70 px-2 py-1 font-mono text-xs tabular-nums text-surface-0 backdrop-blur transition-[top] duration-200 ease-out select-none"
    :class="headerActive ? 'top-14' : 'top-3'"
    aria-hidden="true"
  >
    <i class="pi pi-clock text-[10px] opacity-70" />
    <span>{{ clock.left }}</span>
    <span class="opacity-40">/</span>
    <span>{{ clock.right }}</span>
  </div>
</template>
