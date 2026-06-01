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

// Drag region — explicit @mousedown rather than data-tauri-drag-region,
// which is flaky on decorations:false + transparent:true windows.
async function startDrag(event: MouseEvent): Promise<void> {
  if (!props.isTauri) return;
  if (event.button !== 0) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}
</script>

<template>
  <!-- Drag bar, top-center: a subtle grabber that expands on hover into a bar
       with the map name. The whole strip is the drag region — `group` drives
       the reveal so the idle hint stays tiny and the map stays unobstructed.
       Tauri + unlocked only. -->
  <div
    v-if="isTauri && !overlayClickThrough"
    class="group absolute top-0 left-1/2 z-[1000] flex -translate-x-1/2 justify-center px-6 pt-1.5 pb-2.5"
    @mousedown="startDrag"
  >
    <div
      :title="t('overlay.move')"
      :aria-label="t('overlay.move')"
      class="flex h-1.5 max-w-[2.5rem] cursor-grab items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full bg-surface-700/75 px-2 text-surface-0 backdrop-blur transition-all duration-200 ease-out select-none active:cursor-grabbing group-hover:h-7 group-hover:max-w-[16rem] group-hover:bg-surface-800/85 group-hover:px-3"
    >
      <i
        class="pi pi-bars shrink-0 text-xs opacity-0 transition-opacity duration-150 group-hover:opacity-100 pointer-events-none"
      />
      <span
        class="text-xs font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100 pointer-events-none"
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
