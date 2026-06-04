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
