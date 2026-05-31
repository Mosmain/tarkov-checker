<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { storeToRefs } from 'pinia';
import { useOverlayStore } from '@/features/overlay/store';

/**
 * Phone-pairing dialog (D4). Renders the QR + the literal URL behind
 * it; the user scans on a phone in the same Wi-Fi, the phone lands on
 * the helper-served SPA with `#token=…` in the fragment, main.ts's
 * bootstrap stashes the token into localStorage, and the rest of the
 * SPA picks it up via transport.ts / useServerStream.
 *
 * Lifecycle: mounted-on-open, unmounted-on-close (via `v-if`). Every
 * open regenerates the QR — the token can change via E6 "Reset
 * pairing" (which restarts the app, so opening again is post-restart)
 * and the LAN IP can change if the user switches Wi-Fi. Per-open
 * regeneration covers both with one `invoke` call and zero listeners.
 */

interface PairingQr {
  url: string;
  svg: string;
}

const { t } = useI18n();
const { pairingModalOpen } = storeToRefs(useOverlayStore());

const data = ref<PairingQr | null>(null);
const error = ref<string | null>(null);
const copied = ref(false);

// PrimeVue Dialog wants `v-model:visible` two-way binding. Bridging
// through a computed keeps the store as the single source of truth.
const visible = computed({
  get: () => pairingModalOpen.value,
  set: (v: boolean) => {
    pairingModalOpen.value = v;
  },
});

async function load(): Promise<void> {
  data.value = null;
  error.value = null;
  copied.value = false;
  try {
    data.value = await invoke<PairingQr>('pairing_qr');
  } catch (err) {
    // Most common case: detect_lan_ip returned None (host has no
    // non-loopback interface). User-visible message; the modal stays
    // open so they can read it and close manually.
    error.value = err instanceof Error ? err.message : String(err);
  }
}

// Regenerate on every open. `immediate: false` so the load doesn't
// fire while the modal is closed — wasted work and ugly logs.
watch(visible, (open) => {
  if (open) void load();
});

async function copyUrl(): Promise<void> {
  if (!data.value) return;
  try {
    await navigator.clipboard.writeText(data.value.url);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    // Clipboard API can fail on insecure contexts or denied
    // permission. The URL is right there in the readonly input, so
    // the user can still copy manually. No need to surface an error.
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="t('pairing.title')"
    :modal="true"
    :draggable="false"
    :dismissable-mask="true"
    class="!w-[22rem] !max-w-[90vw]"
  >
    <div v-if="error" class="text-sm text-red-400">
      <p class="font-semibold mb-1">{{ t('pairing.error') }}</p>
      <p class="opacity-80">{{ error }}</p>
    </div>

    <div v-else-if="data" class="flex flex-col items-center gap-4">
      <!--
        v-html is intentional — the SVG payload is built by our own
        Rust command, never from user input. Wrapping in a white box
        so dark-mode QR rendering stays scannable by phones.
      -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="bg-white p-3 rounded" v-html="data.svg" />

      <div class="w-full">
        <label class="block text-[10px] uppercase tracking-wider opacity-70 mb-1">
          {{ t('pairing.url') }}
        </label>
        <div class="flex items-center gap-2">
          <input
            :value="data.url"
            readonly
            class="flex-1 px-2 py-1 text-xs bg-surface-800 rounded border border-surface-700 select-all font-mono"
          />
          <Button
            size="small"
            severity="secondary"
            :label="copied ? t('pairing.copied') : t('pairing.copy')"
            @click="copyUrl"
          />
        </div>
      </div>

      <p class="text-xs text-surface-300 text-center leading-snug">
        {{ t('pairing.hint') }}
      </p>
    </div>

    <div v-else class="text-sm text-surface-300 py-6 text-center">
      {{ t('pairing.loading') }}
    </div>
  </Dialog>
</template>
