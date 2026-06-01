<script setup lang="ts">
import SettingsPanel from '@/features/settings/SettingsPanel.vue';
import type { TransportStatus } from '@/features/server/composables/useServerTransport';

interface Props {
  mapDisplayName: string;
  status: TransportStatus;
  isTauri: boolean;
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

// The bar expands on hover and must STAY expanded while dragging — the OS move
// loop steals pointer events, so `:hover` drops the instant the drag starts.
// Track dragging explicitly; clear it on release (mouseup, or the first
// button-less mousemove as a fallback if the OS swallowed the mouseup).
const hovered = ref(false);
const dragging = ref(false);
const dragBarActive = computed(() => hovered.value || dragging.value);

function endDrag(): void {
  dragging.value = false;
  window.removeEventListener('mouseup', endDrag);
  window.removeEventListener('mousemove', onDragMove);
}

function onDragMove(event: MouseEvent): void {
  if (event.buttons === 0) endDrag();
}

// Explicit @mousedown rather than data-tauri-drag-region, which is flaky on
// decorations:false + transparent:true windows.
async function startDrag(event: MouseEvent): Promise<void> {
  if (!props.isTauri) return;
  if (event.button !== 0) return;
  dragging.value = true;
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('mousemove', onDragMove);
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}

onBeforeUnmount(endDrag);
</script>

<template>
  <!-- Full-width drag bar at the top. The whole strip is the drag region, so
       the window can still be grabbed back when it's been dragged mostly past a
       screen edge. A faint idle line expands into a labelled bar on hover and
       STAYS expanded while dragging. Tauri + unlocked only. -->
  <div
    v-if="isTauri && !overlayClickThrough"
    class="absolute top-0 right-0 left-0 z-[1000] flex h-6 items-start"
    @mousedown="startDrag"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <div
      :title="t('overlay.move')"
      :aria-label="t('overlay.move')"
      class="flex w-full cursor-grab items-center justify-center gap-1.5 overflow-hidden rounded-t-xl text-surface-0 backdrop-blur transition-all duration-200 ease-out select-none active:cursor-grabbing"
      :class="dragBarActive ? 'h-6 bg-surface-800/85' : 'h-1.5 bg-surface-700/55'"
    >
      <i
        class="pi pi-bars shrink-0 text-xs transition-opacity duration-150 pointer-events-none"
        :class="dragBarActive ? 'opacity-100' : 'opacity-0'"
      />
      <span
        class="text-xs font-medium whitespace-nowrap transition-opacity duration-150 pointer-events-none"
        :class="dragBarActive ? 'opacity-100' : 'opacity-0'"
        >{{ mapDisplayName }}</span
      >
    </div>
  </div>

  <div class="absolute top-3 right-3 z-[1000] flex items-center gap-2">
    <!-- Browser: status dot + map name (no window drag there). Tauri: compact
         status dot only — the map name lives in the drag bar, and the locked
         state needs nothing but the connection state. -->
    <span
      v-if="!isTauri"
      class="inline-flex items-center gap-2 rounded-md bg-surface-800/70 px-3 py-1 text-sm font-medium text-surface-0 backdrop-blur pointer-events-none select-none"
    >
      <i :class="['text-[10px]', statusIconClass]" :title="'ws: ' + status" aria-hidden="true" />
      <span>{{ mapDisplayName }}</span>
      <span class="sr-only" aria-live="polite">Connection: {{ status }}</span>
    </span>
    <span
      v-else
      class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-800/70 backdrop-blur pointer-events-none"
      :title="'ws: ' + status"
    >
      <i :class="['text-[10px]', statusIconClass]" aria-hidden="true" />
      <span class="sr-only" aria-live="polite">Connection: {{ status }}</span>
    </span>
    <SettingsPanel v-if="!overlayClickThrough" />
    <Button
      v-if="isTauri && !overlayClickThrough"
      rounded
      severity="secondary"
      class="!bg-surface-800/80 hover:!bg-red-900 !border-surface-700 backdrop-blur"
      aria-label="Close"
      @click="$emit('close')"
    >
      <template #icon>
        <i class="pi pi-times text-sm" />
      </template>
    </Button>
  </div>
</template>
