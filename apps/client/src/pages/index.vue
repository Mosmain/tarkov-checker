<script setup lang="ts">
import MapView from '@/features/map/components/MapView.vue';
import OverlayHeader from '@/features/overlay/components/OverlayHeader.vue';
import OverlayBorder from '@/features/overlay/components/OverlayBorder.vue';
import TarkovTimeChip from '@/features/tarkov-time/TarkovTimeChip.vue';
import OverlayLockIndicator from '@/features/overlay/components/OverlayLockIndicator.vue';
import OverlayErrors from '@/features/overlay/components/OverlayErrors.vue';
import AirdropStatusBanner from '@/features/airdrop/components/AirdropStatusBanner.vue';
import { useMapSettingsStore } from '@/features/map/store';
import { useOverlayStore } from '@/features/overlay/store';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { useTauriOverlay } from '@/features/overlay/composables/useTauriOverlay';
import { showOverlayChrome } from '@/shared/tauri';
import { useTransportStatus } from '@/features/server/composables/useTransportStatus';
import { useGlobalShortcut } from '@/features/hotkeys/composables/useGlobalShortcut';
import { useCloseConfirm } from '@/features/overlay/composables/useCloseConfirm';
import { useAirdropStore } from '@/features/airdrop/store';
import { useAirdropTracker } from '@/features/airdrop/composables/useAirdropTracker';

const { mapCode } = storeToRefs(useMapSettingsStore());
const { clickThrough: overlayClickThrough } = storeToRefs(useOverlayStore());
const { lockHotkey, zoomInHotkey, zoomOutHotkey, floorUpHotkey, floorDownHotkey, airdropHotkey } =
  storeToRefs(useHotkeysStore());

const airdropStore = useAirdropStore();
useAirdropTracker();

const { isTauri } = useTauriOverlay();
const status = useTransportStatus();
const confirmClose = useCloseConfirm();

const mapDisplayName = ref<string>('…');
const mapError = ref<string | null>(null);

// Template ref to MapView — its imperative methods are exposed via
// defineExpose. `?.` keeps every shortcut handler safe to call before the
// component mounts (e.g. immediately after a `:key` swap on map change).
const mapRef = ref<InstanceType<typeof MapView> | null>(null);
useGlobalShortcut(isTauri, zoomInHotkey, () => mapRef.value?.zoomIn());
useGlobalShortcut(isTauri, zoomOutHotkey, () => mapRef.value?.zoomOut());
useGlobalShortcut(isTauri, floorUpHotkey, () => mapRef.value?.nextFloor());
useGlobalShortcut(isTauri, floorDownHotkey, () => mapRef.value?.prevFloor());
useGlobalShortcut(isTauri, airdropHotkey, () => airdropStore.press());
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
    :overlay-click-through="overlayClickThrough"
    @close="confirmClose"
  />

  <OverlayErrors :map-error="mapError" @dismiss-map="mapError = null" @retry="mapRef?.reload()" />

  <AirdropStatusBanner />

  <TarkovTimeChip />

  <OverlayBorder v-if="showOverlayChrome && !overlayClickThrough" />

  <OverlayLockIndicator
    v-if="showOverlayChrome"
    :lock-hotkey="lockHotkey"
    :overlay-click-through="overlayClickThrough"
    @lock="overlayClickThrough = true"
  />
</template>
