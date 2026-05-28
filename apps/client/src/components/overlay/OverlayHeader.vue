<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import SettingsPanel from "../SettingsPanel.vue";
import type { TransportStatus } from "../../composables/useServerTransport";

interface Props {
  mapDisplayName: string;
  status: TransportStatus;
  isTauri: boolean;
  overlayClickThrough: boolean;
}

const props = defineProps<Props>();
defineEmits<{ close: [] }>();

const statusIconClass = computed(() => {
  switch (props.status) {
    case "open":
      return "pi pi-circle-fill text-green-500";
    case "connecting":
      return "pi pi-circle-fill text-amber-400 animate-pulse";
    case "closed":
      return "pi pi-times-circle text-red-500";
    default:
      return "pi pi-circle text-surface-500";
  }
});

// Drag region — explicit @mousedown rather than data-tauri-drag-region,
// which is flaky on decorations:false + transparent:true windows.
async function startDrag(event: MouseEvent): Promise<void> {
  if (!props.isTauri) return;
  if (event.button !== 0) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}
</script>

<template>
  <div class="absolute top-3 right-3 z-[1000] flex items-center gap-2">
    <span
      class="inline-flex items-center gap-2 rounded-md bg-surface-800/70 px-3 py-1 text-sm font-medium text-surface-0 backdrop-blur select-none"
      :class="isTauri ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'"
      @mousedown="startDrag"
    >
      <i
        :class="['text-[10px] pointer-events-none', statusIconClass]"
        :title="'ws: ' + status"
        aria-hidden="true"
      />
      <span class="pointer-events-none">{{ mapDisplayName }}</span>
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
