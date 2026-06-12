<script setup lang="ts">
import { isTauri } from '@/shared/tauri';
import { useOverlayStore } from '@/features/overlay/store';
import { useUpdaterStore } from '@/features/updater/store';

const { t } = useI18n();
const { clickThrough } = storeToRefs(useOverlayStore());

const updater = useUpdaterStore();
const { info, installing, installFailed, autoCheck, bannerDismissed } = storeToRefs(updater);

onMounted(() => {
  if (isTauri && autoCheck.value) void updater.check();
});
</script>

<template>
  <!-- Hidden while click-through-locked: the banner is interactive chrome. -->
  <div
    v-if="info && !bannerDismissed && !clickThrough"
    class="border-surface-700 bg-surface-900/95 fixed bottom-2 left-1/2 z-[1100] flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-lg"
  >
    <template v-if="!installFailed">
      <span>{{ t('updater.available', { version: info.latest }) }}</span>
      <Button
        size="small"
        :label="installing ? t('updater.installing') : t('updater.install')"
        :loading="installing"
        @click="updater.install"
      />
    </template>
    <span v-else class="text-amber-400">{{ t('updater.error') }}</span>
    <button
      class="pi pi-times text-surface-400 hover:text-surface-0 cursor-pointer text-[10px]"
      :aria-label="t('close')"
      @click="bannerDismissed = true"
    />
  </div>
</template>
