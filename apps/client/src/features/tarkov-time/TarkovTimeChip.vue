<script setup lang="ts">
import { tarkovTime } from '@shared/tarkov-time';
import { useOverlayHeaderActive } from '@/features/overlay/composables/useOverlayHeaderActive';
import type { TransportStatus } from '@/features/server/composables/useServerTransport';

// Always-visible info chip (top-left), shown in every state (idle + locked).
// In the browser it also folds in the connection-status dot and (on wider
// screens) the map name, so the right-hand cluster can shrink to just the
// settings gear on a narrow 320px phone. In the Tauri overlay `status` is
// omitted (the overlay header renders its own dot) and the map name shows
// unconditionally.
const props = defineProps<{
  mapDisplayName?: string;
  status?: TransportStatus;
  /** Browser: hide the map name below ~380px so the chip fits a 320px phone. */
  compactMapName?: boolean;
}>();

// Non-interactive. In-game time runs 7× real time, so a fixed interval makes the
// seconds stutter (a sample lands inside the same second twice). Sample each
// animation frame and swap the ref only when the shown value changes — each
// second renders once for its true ~143ms, ticking smoothly without re-rendering
// 60×/s. (rAF pauses while the tab is hidden, then self-corrects on return.)
const clock = ref(tarkovTime(Date.now()));
let raf: number | undefined;
function tick(): void {
  const next = tarkovTime(Date.now());
  if (
    next.left !== clock.value.left ||
    next.right !== clock.value.right ||
    next.seconds !== clock.value.seconds
  ) {
    clock.value = next;
  }
  raf = requestAnimationFrame(tick);
}
onMounted(() => {
  raf = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  if (raf !== undefined) cancelAnimationFrame(raf);
});

// Slide down out of the way when the overlay drag bar expands; back up after.
const { active: headerActive } = useOverlayHeaderActive();

const statusDotClass = computed(() => {
  switch (props.status) {
    case 'open':
      return 'pi-circle-fill text-green-500';
    case 'connecting':
      return 'pi-circle-fill text-amber-400 animate-pulse';
    case 'closed':
      return 'pi-times-circle text-red-500';
    default:
      return 'pi-circle text-surface-500';
  }
});
</script>

<template>
  <!-- Slide via transform (composited), matching the header's reveal. -->
  <div
    class="sa-top sa-left pointer-events-none absolute z-[1000] flex h-10 items-center transition-transform duration-200 ease-out"
    :class="headerActive ? 'translate-y-11' : 'translate-y-0'"
  >
    <span
      class="inline-flex max-w-[16rem] items-center gap-1.5 rounded-md bg-surface-800/70 px-2 py-1 font-mono text-xs tabular-nums text-surface-0 backdrop-blur select-none"
      aria-hidden="true"
    >
      <i v-if="status" :class="['pi text-[9px]', statusDotClass]" />
      <span>{{ clock.left }}<span class="opacity-50">:{{ clock.seconds }}</span></span>
      <span class="opacity-40">/</span>
      <span>{{ clock.right }}<span class="opacity-50">:{{ clock.seconds }}</span></span>
      <span
        v-if="mapDisplayName"
        class="items-center gap-1.5"
        :class="compactMapName ? 'hidden min-[380px]:inline-flex' : 'inline-flex'"
      >
        <span class="opacity-25">|</span>
        <span class="max-w-[8.75rem] truncate font-sans text-[11px] font-medium opacity-90">{{
          mapDisplayName
        }}</span>
      </span>
    </span>
    <span v-if="status" class="sr-only" aria-live="polite">Connection: {{ status }}</span>
  </div>
</template>
