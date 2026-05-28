<script setup lang="ts">
import HotkeyRecorder from '@/features/hotkeys/components/HotkeyRecorder.vue';
import { useHotkeysStore } from '@/features/hotkeys/store';

const { lockHotkey, zoomInHotkey, zoomOutHotkey, floorUpHotkey, floorDownHotkey } =
  storeToRefs(useHotkeysStore());
const { t } = useI18n();
</script>

<template>
  <Fieldset :legend="t('hotkeys.heading')">
    <div class="space-y-3">
      <HotkeyRecorder v-model="lockHotkey" :label="t('hotkeys.lock')" />
      <HotkeyRecorder v-model="zoomInHotkey" :label="t('hotkeys.zoomIn')" />
      <HotkeyRecorder v-model="zoomOutHotkey" :label="t('hotkeys.zoomOut')" />
      <HotkeyRecorder v-model="floorUpHotkey" :label="t('hotkeys.floorUp')" />
      <HotkeyRecorder v-model="floorDownHotkey" :label="t('hotkeys.floorDown')" />
      <p class="text-[10px] leading-relaxed opacity-50">{{ t('hotkeys.lockHint') }}</p>
    </div>
  </Fieldset>
</template>
