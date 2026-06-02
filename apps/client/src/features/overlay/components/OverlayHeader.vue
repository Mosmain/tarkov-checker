<script setup lang="ts">
import SettingsPanel from '@/features/settings/SettingsPanel.vue';
import { isTauri } from '@/shared/tauri';
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

// The bar expands on hover and must STAY expanded while dragging — the OS move
// loop steals pointer events, so `:hover` drops the instant the drag starts.
// Track dragging explicitly and clear it on release: mouseup, or the first
// button-less mousemove as a fallback if the OS swallowed the mouseup. VueUse's
// useEventListener owns the add/remove + teardown, so no manual cleanup.
const hovered = ref(false);
const dragging = ref(false);
const dragBarActive = computed(() => hovered.value || dragging.value);

useEventListener(window, 'mouseup', () => {
  dragging.value = false;
});
useEventListener(window, 'mousemove', (e: MouseEvent) => {
  if (dragging.value && e.buttons === 0) dragging.value = false;
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
  <!-- Drag affordance. The full-width outer strip is the drag region (so the
       window stays grabbable even when dragged mostly past a screen edge), and
       @mousedown works anywhere across it. The visible part is an airy pill
       floating below the top edge — clear of the dashed border and the
       right-hand controls — that grows from a grabber into a labelled bar.
       Hover/expand is scoped to the centre, so reaching for the controls won't
       trigger it, and `dragging` keeps it open once the OS takes over the move.
       Tauri + unlocked only. -->
  <div
    v-if="tauriChrome && !overlayClickThrough"
    class="absolute top-0 right-0 left-0 z-[1000] flex justify-center"
    @mousedown="startDrag"
  >
    <div
      class="flex justify-center px-10 pt-2 pb-3"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <div
        :title="t('overlay.move')"
        :aria-label="t('overlay.move')"
        class="flex cursor-grab items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full text-surface-0 ring-1 ring-white/10 backdrop-blur transition-all duration-200 ease-out select-none active:cursor-grabbing"
        :class="
          dragBarActive
            ? 'h-8 max-w-[20rem] bg-surface-800/90 px-4 shadow-lg'
            : 'h-2.5 max-w-[3rem] bg-surface-700/70 px-0 shadow-md'
        "
      >
        <i
          class="pi pi-bars shrink-0 text-xs transition-opacity duration-150 pointer-events-none"
          :class="dragBarActive ? 'opacity-90' : 'opacity-0'"
        />
        <span
          class="text-sm font-medium transition-opacity duration-150 pointer-events-none"
          :class="dragBarActive ? 'opacity-100' : 'opacity-0'"
          >{{ mapDisplayName }}</span
        >
      </div>
    </div>
  </div>

  <div class="absolute top-3 right-3 z-[1000] flex items-center gap-2">
    <!-- Browser: status dot + map name (no window drag there). Tauri: compact
         status dot only — the map name lives in the drag bar, and the locked
         state needs nothing but the connection state. -->
    <span
      v-if="!tauriChrome"
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
      v-if="tauriChrome && !overlayClickThrough"
      rounded
      severity="secondary"
      class="!bg-surface-800/80 hover:!bg-red-900 !border-surface-700 backdrop-blur"
      :aria-label="t('close')"
      @click="$emit('close')"
    >
      <template #icon>
        <i class="pi pi-times text-sm" />
      </template>
    </Button>
  </div>
</template>
