<script setup lang="ts">
import HotkeyRecorder from '@/features/hotkeys/components/HotkeyRecorder.vue';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { isTauri } from '@/shared/tauri';
import type { HotkeyConfig } from '@shared/hotkeys-api';

const store = useHotkeysStore();
const { lockHotkey, zoomInHotkey, zoomOutHotkey, floorUpHotkey, floorDownHotkey, airdropHotkey } =
  storeToRefs(store);
const { t } = useI18n();

// The five action combos are backend-owned: route a recorded combo through
// `setAction` (PUT + effective-value snap-back) rather than writing the ref
// directly. Lock stays a plain client-side persistedRef (v-model).
function onAction(field: keyof HotkeyConfig, combo: string): void {
  void store.setAction(field, combo);
}
</script>

<template>
  <div class="space-y-3">
    <!-- Lock is overlay-only (no window to lock in a browser). -->
    <HotkeyRecorder v-if="isTauri" v-model="lockHotkey" :label="t('hotkeys.lock')" />
    <HotkeyRecorder
      :model-value="zoomInHotkey"
      :label="t('hotkeys.zoomIn')"
      @update:model-value="onAction('zoomIn', $event)"
    />
    <HotkeyRecorder
      :model-value="zoomOutHotkey"
      :label="t('hotkeys.zoomOut')"
      @update:model-value="onAction('zoomOut', $event)"
    />
    <HotkeyRecorder
      :model-value="floorUpHotkey"
      :label="t('hotkeys.floorUp')"
      @update:model-value="onAction('floorUp', $event)"
    />
    <HotkeyRecorder
      :model-value="floorDownHotkey"
      :label="t('hotkeys.floorDown')"
      @update:model-value="onAction('floorDown', $event)"
    />

    <!-- Read-only gesture: Alt + mouse wheel over the map steps floors. Listed
         here for discoverability but not rebindable (lock icon in the button
         slot instead of a recorder), matching the recorder row layout. -->
    <div>
      <p class="mb-1 text-xs opacity-60">{{ t('hotkeys.floorWheel') }}</p>
      <div class="flex items-center justify-between gap-2">
        <div
          class="bg-surface-900/60 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wider opacity-70"
        >
          <span class="border-surface-600 bg-surface-900 rounded border px-1.5 py-0.5 font-mono">
            Alt
          </span>
          <span class="px-1 opacity-60">+</span>
          <span class="border-surface-600 bg-surface-900 rounded border px-1.5 py-0.5 font-mono">
            {{ t('hotkeys.scroll') }}
          </span>
        </div>
        <i
          v-tooltip.left="t('hotkeys.fixed')"
          class="pi pi-lock shrink-0 text-xs opacity-40"
          :aria-label="t('hotkeys.fixed')"
        />
      </div>
    </div>

    <HotkeyRecorder
      :model-value="airdropHotkey"
      :label="t('hotkeys.airdrop')"
      @update:model-value="onAction('airdrop', $event)"
    />
    <p v-if="isTauri" class="text-[10px] leading-relaxed opacity-70">
      {{ t('hotkeys.lockHint') }}
    </p>
  </div>
</template>
