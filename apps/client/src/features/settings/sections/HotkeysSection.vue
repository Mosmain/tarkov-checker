<script setup lang="ts">
import HotkeyRecorder from '@/features/hotkeys/components/HotkeyRecorder.vue';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { isTauri } from '@/shared/tauri';

const { lockHotkey, zoomInHotkey, zoomOutHotkey, floorUpHotkey, floorDownHotkey, airdropHotkey } =
  storeToRefs(useHotkeysStore());
const { t } = useI18n();
</script>

<template>
  <Fieldset :legend="t('hotkeys.heading')">
    <div class="space-y-3">
      <!-- Lock is overlay-only (no window to lock in a browser). -->
      <HotkeyRecorder v-if="isTauri" v-model="lockHotkey" :label="t('hotkeys.lock')" />
      <HotkeyRecorder v-model="zoomInHotkey" :label="t('hotkeys.zoomIn')" />
      <HotkeyRecorder v-model="zoomOutHotkey" :label="t('hotkeys.zoomOut')" />
      <HotkeyRecorder v-model="floorUpHotkey" :label="t('hotkeys.floorUp')" />
      <HotkeyRecorder v-model="floorDownHotkey" :label="t('hotkeys.floorDown')" />
      <HotkeyRecorder v-model="airdropHotkey" :label="t('hotkeys.airdrop')" />
      <p v-if="isTauri" class="text-[10px] leading-relaxed opacity-70">{{ t('hotkeys.lockHint') }}</p>
    </div>
  </Fieldset>
</template>
