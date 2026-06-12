<script setup lang="ts">
import { isTauri } from '@/shared/tauri';
import { useUpdaterStore } from '@/features/updater/store';
import { useAppVersion } from '@/features/updater/composables/useAppVersion';

const RELEASES_URL = 'https://github.com/Mosmain/tarkov-checker/releases';

const { t } = useI18n();
const version = useAppVersion();

const updater = useUpdaterStore();
const { autoCheck, info, checking, installing, lastCheck } = storeToRefs(updater);

// "Up to date" settles for a moment, then the button returns to its idle
// label; errors stay until the next click (per the design review). Driven by
// the click completing — NOT by watching lastCheck, whose value doesn't
// change on a repeat "still up to date" outcome.
const showLatest = ref(false);
let latestTimer: ReturnType<typeof setTimeout> | undefined;
function flashUpToDate(): void {
  clearTimeout(latestTimer);
  showLatest.value = true;
  latestTimer = setTimeout(() => {
    showLatest.value = false;
  }, 3000);
}

const buttonLabel = computed(() => {
  if (info.value) return t('updater.updateTo', { version: info.value.latest });
  if (showLatest.value) return t('updater.upToDate');
  if (lastCheck.value === 'error') return t('updater.checkFailed');
  return t('updater.checkButton');
});

async function onButtonClick(): Promise<void> {
  // An update is already known (banner is up) — the button becomes the same
  // install action, not a re-fetch.
  if (info.value) {
    void updater.install();
    return;
  }
  showLatest.value = false;
  await updater.check();
  if (!info.value && lastCheck.value === 'latest') flashUpToDate();
}

async function openReleases(event: MouseEvent): Promise<void> {
  if (!isTauri) return; // plain anchor navigation handles the browser case
  event.preventDefault();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_releases_page').catch(() => undefined);
}
</script>

<template>
  <!-- No border of its own: the accordion's last panel already draws one. -->
  <div class="mt-3">
    <div class="text-surface-400 flex items-center justify-between gap-2 text-xs">
      <a
        :href="RELEASES_URL"
        target="_blank"
        rel="noreferrer"
        class="text-surface-300 hover:underline"
        @click="openReleases"
      >
        {{ version ? `v${version}` : '—' }}
        <i class="pi pi-external-link ml-0.5 text-[9px]" aria-hidden="true" />
      </a>
      <Button
        v-if="isTauri"
        size="small"
        :variant="info ? 'outlined' : 'text'"
        :severity="info ? undefined : 'secondary'"
        :class="showLatest ? '!text-green-400' : ''"
        :label="buttonLabel"
        :loading="checking || installing"
        @click="onButtonClick"
      />
    </div>
    <div v-if="isTauri" class="mt-1.5 flex items-center justify-between gap-2">
      <label for="updater-auto-check" class="text-surface-400 text-xs">
        {{ t('updater.autoCheckLabel') }}
      </label>
      <ToggleSwitch v-model="autoCheck" input-id="updater-auto-check" class="shrink-0 scale-90" />
    </div>
  </div>
</template>
