<script setup lang="ts">
import SettingsPanel from '@/features/settings/SettingsPanel.vue';
import { isTauri } from '@/shared/tauri';
import { useOverlayHeaderActive } from '../composables/useOverlayHeaderActive';
import type { TransportStatus } from '@/features/server/composables/useServerTransport';

interface Props {
  mapDisplayName: string;
  status: TransportStatus;
  /** Render the Tauri overlay chrome (true under real Tauri, or the dev
   *  preview flag). Native window calls still guard on the real `isTauri`. */
  tauriChrome: boolean;
  overlayClickThrough: boolean;
}

const props = defineProps<Props>();
defineEmits<{ close: [] }>();

const { t } = useI18n();

const statusIconClass = computed(() => {
  switch (props.status) {
    case 'open':
      return 'pi pi-circle-fill text-green-500';
    case 'connecting':
      return 'pi pi-circle-fill text-amber-400 animate-pulse';
    case 'closed':
      return 'pi pi-times-circle text-red-500';
    default:
      return 'pi pi-circle text-surface-500';
  }
});

// Shared with sibling chrome (the floating clock slides down when this is
// active). The bar expands on hover and must STAY expanded while dragging —
// the OS move loop steals pointer events, so `:hover` drops the instant the
// drag starts. Track dragging explicitly and clear it on release: mouseup, or
// the first button-less mousemove as a fallback if the OS swallowed the mouseup.
const { hovered, dragging, active: dragBarActive } = useOverlayHeaderActive();

useEventListener(window, 'mouseup', () => {
  dragging.value = false;
});
useEventListener(window, 'mousemove', (e: MouseEvent) => {
  if (dragging.value && e.buttons === 0) dragging.value = false;
});

// The band unmounts when locked, so its @mouseleave never fires — reset
// explicitly so the shared state (and the clock) don't get stuck "active".
watch(
  () => props.overlayClickThrough,
  (locked) => {
    if (locked) {
      hovered.value = false;
      dragging.value = false;
    }
  },
);
onBeforeUnmount(() => {
  hovered.value = false;
  dragging.value = false;
});

// Explicit @mousedown rather than data-tauri-drag-region, which is flaky on
// decorations:false + transparent:true windows.
async function startDrag(event: MouseEvent): Promise<void> {
  if (!isTauri) return;
  if (event.button !== 0) return;
  dragging.value = true;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}
</script>

<template>
  <!-- OVERLAY (Tauri/preview), unlocked: a full-width top band that is both the
       hover trigger and the drag region (grabbable anywhere, even when the
       window is dragged mostly past a screen edge). Idle, only a small airy
       grabber nub shows; hovering/dragging reveals two SEPARATE, never-
       overlapping zones — a drag pill (left, flex-1) and the control cluster
       (right, auto-width) — as flex siblings, so they can't collide. The pill
       is visual only; the band owns the drag. -->
  <div
    v-if="tauriChrome && !overlayClickThrough"
    class="absolute top-0 right-0 left-0 z-[1000] flex h-12 cursor-grab items-start px-2 pt-2 active:cursor-grabbing"
    @mousedown="startDrag"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- Idle grabber nub (centred), cross-fades out when the bar is active. -->
    <div
      class="pointer-events-none absolute top-1.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-surface-500/70 shadow-md transition-opacity duration-200"
      :class="dragBarActive ? 'opacity-0' : 'opacity-100'"
      aria-hidden="true"
    />

    <!-- Revealed chrome: drag pill + controls, flex siblings (no overlap). -->
    <div
      class="flex h-10 w-full items-center gap-2 transition-all duration-200 ease-out"
      :class="
        dragBarActive ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'
      "
    >
      <!-- Drag pill: visual only; mousedown falls through to the band. -->
      <div
        :title="t('overlay.move')"
        :aria-label="t('overlay.move')"
        class="pointer-events-none flex h-10 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl bg-surface-800/85 px-4 text-surface-0 ring-1 ring-white/10 backdrop-blur select-none"
      >
        <i class="pi pi-arrows-alt shrink-0 text-xs opacity-90" aria-hidden="true" />
        <span class="truncate text-sm font-medium">{{ mapDisplayName }}</span>
      </div>

      <!-- Controls: own pointer events, never start a drag. -->
      <div class="flex shrink-0 items-center gap-2" @mousedown.stop>
        <span
          class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-800/85 ring-1 ring-white/10 backdrop-blur"
          :title="'ws: ' + status"
        >
          <i :class="['text-[10px]', statusIconClass]" aria-hidden="true" />
          <span class="sr-only" aria-live="polite">Connection: {{ status }}</span>
        </span>
        <SettingsPanel />
        <Button
          rounded
          severity="secondary"
          class="!bg-surface-800/85 hover:!bg-red-900 !border-surface-700 backdrop-blur"
          :aria-label="t('close')"
          @click="$emit('close')"
        >
          <template #icon>
            <i class="pi pi-times text-sm" />
          </template>
        </Button>
      </div>
    </div>
  </div>

  <!-- OVERLAY locked: just the connection dot — no interactive chrome. -->
  <div v-else-if="tauriChrome" class="absolute top-3 right-3 z-[1000]">
    <span
      class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-800/70 backdrop-blur pointer-events-none"
      :title="'ws: ' + status"
    >
      <i :class="['text-[10px]', statusIconClass]" aria-hidden="true" />
      <span class="sr-only" aria-live="polite">Connection: {{ status }}</span>
    </span>
  </div>

  <!-- BROWSER: no window drag — keep a static status + map name pill + settings. -->
  <div v-else class="absolute top-3 right-3 z-[1000] flex items-center gap-2">
    <span
      class="inline-flex items-center gap-2 rounded-md bg-surface-800/70 px-3 py-1 text-sm font-medium text-surface-0 backdrop-blur pointer-events-none select-none"
    >
      <i :class="['text-[10px]', statusIconClass]" :title="'ws: ' + status" aria-hidden="true" />
      <span>{{ mapDisplayName }}</span>
      <span class="sr-only" aria-live="polite">Connection: {{ status }}</span>
    </span>
    <SettingsPanel />
  </div>
</template>
