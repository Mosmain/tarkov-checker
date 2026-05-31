<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useOverlayStore } from '@/features/overlay/store';

/**
 * Phone-pairing settings tile. Single button that opens the
 * PairingModal mounted at App.vue. The same modal is also reachable
 * from the tray menu (E4) — both surfaces just flip the store flag.
 *
 * Registered as a `system`-group section because pairing is per-host
 * infrastructure, not a per-overlay preference.
 */
const { pairingModalOpen } = storeToRefs(useOverlayStore());
const { t } = useI18n();
</script>

<template>
  <Fieldset :legend="t('pairing.heading')">
    <p class="text-xs opacity-70 mb-3 leading-snug">{{ t('pairing.sectionHint') }}</p>
    <Button
      :label="t('pairing.open')"
      icon="pi pi-qrcode"
      severity="secondary"
      class="w-full"
      @click="pairingModalOpen = true"
    />
  </Fieldset>
</template>
