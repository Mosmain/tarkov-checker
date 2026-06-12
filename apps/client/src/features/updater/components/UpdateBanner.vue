<script setup lang="ts">
import { isTauri } from '@/shared/tauri';
import { useOverlayStore } from '@/features/overlay/store';

/** Mirrors `UpdateInfo` in src-tauri/src/updater.rs (downloadUrl stays Rust-side). */
interface UpdateInfo {
  current: string;
  latest: string;
  releaseUrl: string;
}

const { t } = useI18n();
const { clickThrough } = storeToRefs(useOverlayStore());

const info = ref<UpdateInfo | null>(null);
const installing = ref(false);
const failed = ref(false);
const dismissed = ref(false);

onMounted(async () => {
  if (!isTauri) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    info.value = await invoke<UpdateInfo | null>('check_update');
  } catch (e) {
    // Convenience check only — offline / rate-limited GitHub is not an error
    // worth surfacing, the app works fine on the current version.
    console.warn('[updater] check failed:', e);
  }
});

async function install(): Promise<void> {
  if (installing.value) return;
  installing.value = true;
  failed.value = false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    // On success the backend swaps the exe, respawns it and exits this
    // process — there is no resolved state to handle.
    await invoke('install_update');
  } catch (e) {
    console.warn('[updater] install failed:', e);
    failed.value = true;
    installing.value = false;
  }
}
</script>

<template>
  <!-- Hidden while click-through-locked: the banner is interactive chrome. -->
  <div
    v-if="info && !dismissed && !clickThrough"
    class="border-surface-700 bg-surface-900/95 fixed bottom-2 left-1/2 z-[1100] flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs shadow-lg"
  >
    <template v-if="!failed">
      <span>{{ t('updater.available', { version: info.latest }) }}</span>
      <Button
        size="small"
        :label="installing ? t('updater.installing') : t('updater.install')"
        :loading="installing"
        @click="install"
      />
    </template>
    <span v-else class="text-amber-400">{{ t('updater.error') }}</span>
    <button
      class="pi pi-times text-surface-400 hover:text-surface-0 cursor-pointer text-[10px]"
      :aria-label="t('close')"
      @click="dismissed = true"
    />
  </div>
</template>
