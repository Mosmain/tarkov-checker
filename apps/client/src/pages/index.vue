<script setup lang="ts">
import MapView from '@/features/map/components/MapView.vue';
import OverlayHeader from '@/features/overlay/components/OverlayHeader.vue';
import OverlayBorder from '@/features/overlay/components/OverlayBorder.vue';
import TarkovTimeChip from '@/features/tarkov-time/TarkovTimeChip.vue';
import OverlayLockIndicator from '@/features/overlay/components/OverlayLockIndicator.vue';
import OverlayErrors from '@/features/overlay/components/OverlayErrors.vue';
import AirdropStatusBanner from '@/features/airdrop/components/AirdropStatusBanner.vue';
import { useMapSettingsStore } from '@/features/map/store';
import { useOverlayLock } from '@/features/overlay/composables/useOverlayLock';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { showOverlayChrome } from '@/shared/tauri';
import { useTransportStatus } from '@/features/server/composables/useTransportStatus';
import { useServerEvent } from '@/features/server/composables/useServerEvents';
import { useCloseConfirm } from '@/features/overlay/composables/useCloseConfirm';
import { useAirdropStore } from '@/features/airdrop/store';
import { useAirdropTracker } from '@/features/airdrop/composables/useAirdropTracker';

const { mapCode } = storeToRefs(useMapSettingsStore());
const { showControls } = useOverlayLock();
// Only the lock combo is still client-owned; the rest arrive as backend
// `command` events (see below) so they fire regardless of focus.
const { lockHotkey } = storeToRefs(useHotkeysStore());

const airdropStore = useAirdropStore();
useAirdropTracker();

const status = useTransportStatus();
const confirmClose = useCloseConfirm();

const mapDisplayName = ref<string>('…');
const mapError = ref<string | null>(null);

// Template ref to MapView — its imperative methods are exposed via
// defineExpose. `?.` keeps every shortcut handler safe to call before the
// component mounts (e.g. immediately after a `:key` swap on map change).
const mapRef = ref<InstanceType<typeof MapView> | null>(null);

// Hotkeys are owned by the backend now: it registers OS-global shortcuts (which
// fire even while the game is focused) and broadcasts a `command` event. Every
// client — overlay webview, browser, LAN phone — dispatches it here, so the
// action runs regardless of which client (if any) has focus.
useServerEvent('command', (msg) => {
  switch (msg.action) {
    case 'zoom-in':
      mapRef.value?.zoomIn();
      break;
    case 'zoom-out':
      mapRef.value?.zoomOut();
      break;
    case 'floor-up':
      mapRef.value?.floorUp();
      break;
    case 'floor-down':
      mapRef.value?.floorDown();
      break;
    case 'airdrop':
      airdropStore.press();
      break;
  }
});
</script>

<template>
  <MapView
    ref="mapRef"
    :key="mapCode"
    :map-code="mapCode"
    @map-name="mapDisplayName = $event"
    @map-error="mapError = $event"
  />

  <OverlayHeader
    :map-display-name="mapDisplayName"
    :status="status"
    :tauri-chrome="showOverlayChrome"
    @close="confirmClose"
  />

  <OverlayErrors :map-error="mapError" @dismiss-map="mapError = null" @retry="mapRef?.reload()" />

  <AirdropStatusBanner />

  <TarkovTimeChip :map-display-name="showOverlayChrome ? mapDisplayName : ''" />

  <OverlayBorder v-if="showOverlayChrome && showControls" />

  <OverlayLockIndicator v-if="showOverlayChrome" :lock-hotkey="lockHotkey" />
</template>
