<script setup lang="ts">
import { useAirdropStore } from '../store';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { formatHotkeyParts } from '@/features/hotkeys/lib/hotkey';

const store = useAirdropStore();
const { airdropHotkey } = storeToRefs(useHotkeysStore());
const { t } = useI18n();

// Render the user's bound combo inline so the banner instructions stay
// honest if the player rebinds. `formatHotkeyParts` returns display
// tokens (`['Ctrl', 'Alt', 'D']`) — we join with `+` for a compact
// in-sentence form. Re-computes automatically when the binding changes.
const hotkeyDisplay = computed(() => formatHotkeyParts(airdropHotkey.value).join('+'));

// `3.000 → 0.000` countdown — driven by the store's rAF loop. Padded to 3
// decimals so the digit width stays stable across frames (no banner jitter
// from variable-width "3.0" → "2.99" → "2.989" rendering). The store
// updates `confirmRemainingMs` 60Hz-ish; this just formats whatever ref
// value the current frame reads.
const confirmCountdown = computed(() => (store.confirmRemainingMs / 1000).toFixed(3));

const bannerText = computed(() => {
  const hotkey = hotkeyDisplay.value;
  switch (store.phase) {
    case 'armedFirst':
      return t('airdrop.armedFirst');
    case 'armedSecond':
      return t('airdrop.armedSecond');
    case 'result': {
      const o = store.outcome;
      if (!o) return '';
      if (o.ok) {
        // Live readout: distance from the player's latest screenshot to the
        // predicted touchdown, recomputed on every fresh position event so
        // the player can watch it count down as they walk toward the drop.
        // Falls back to the original sample-B distance if no position has
        // landed yet for some reason (shouldn't happen — sample B itself
        // populates `playerCurrentPos` before we land in `result`).
        const live = store.distanceToDrop;
        const dist = Math.round(live ?? Math.max(o.result.distFromA, o.result.distFromB));
        return t('airdrop.resultOk', { dist, hotkey });
      }
      switch (o.failure.kind) {
        case 'parallel':
          return t('airdrop.failParallel');
        case 'behind':
          return t('airdrop.failBehind');
        case 'too_far':
          return t('airdrop.failTooFar', { dist: Math.round(o.failure.distance) });
      }
      return '';
    }
    default:
      return '';
  }
});

const severity = computed<'info' | 'warn' | 'success'>(() => {
  if (store.phase === 'result') {
    return store.outcome?.ok ? 'success' : 'warn';
  }
  if (store.phase === 'confirmingClear') return 'warn';
  return 'info';
});
</script>

<template>
  <div
    v-if="store.phase !== 'idle'"
    class="pointer-events-none absolute top-14 inset-x-3 z-[1000] flex justify-center"
  >
    <Message
      :severity="severity"
      size="small"
      :closable="false"
      class="!max-w-md !bg-surface-900 !border-surface-700"
    >
      <!-- Countdown phase uses component-interpolation so just the seconds
           number gets a monospace inline-block — keeps each digit at the
           same horizontal slot (Bender doesn't ship the OpenType `tnum`
           feature, so tabular-nums alone wouldn't pin the width). The rest
           of the sentence stays in the regular UI font. -->
      <i18n-t v-if="store.phase === 'confirmingClear'" keypath="airdrop.confirmClear" tag="span">
        <template #hotkey>{{ hotkeyDisplay }}</template>
        <template #seconds>
          <span class="font-mono inline-block">{{ confirmCountdown }}</span>
        </template>
      </i18n-t>
      <template v-else>{{ bannerText }}</template>
    </Message>
  </div>
</template>
