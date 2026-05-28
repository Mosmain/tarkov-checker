<script setup lang="ts">
import { formatHotkeyParts } from '@/features/hotkeys/lib/hotkey';

interface Props {
  lockHotkey: string;
  overlayClickThrough: boolean;
}

const props = defineProps<Props>();
defineEmits<{ lock: [] }>();

const lockHotkeyParts = computed(() => formatHotkeyParts(props.lockHotkey));
</script>

<template>
  <div class="absolute bottom-3 right-3 z-[1000] flex items-center gap-2">
    <span
      class="pointer-events-none inline-flex items-center gap-1 rounded-md bg-surface-800/70 px-2 py-1 text-[10px] font-semibold tracking-wider backdrop-blur"
    >
      <kbd v-for="(part, idx) in lockHotkeyParts" :key="idx" class="inline-flex items-center">
        <span class="rounded border border-surface-600 bg-surface-900 px-1.5 py-0.5 font-mono">
          {{ part }}
        </span>
        <span v-if="idx < lockHotkeyParts.length - 1" class="px-1 opacity-60">+</span>
      </kbd>
    </span>
    <Button
      rounded
      :severity="overlayClickThrough ? 'primary' : 'secondary'"
      class="!bg-surface-800/80 hover:!bg-surface-800 !border-surface-700 backdrop-blur"
      :aria-label="overlayClickThrough ? 'Locked' : 'Lock interaction'"
      @click="$emit('lock')"
    >
      <template #icon>
        <i :class="overlayClickThrough ? 'pi pi-lock' : 'pi pi-lock-open'" />
      </template>
    </Button>
  </div>
</template>
