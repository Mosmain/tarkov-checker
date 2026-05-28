<script setup lang="ts">
import MapView from "../features/map/components/MapView.vue";
import OverlayHeader from "../features/overlay/components/OverlayHeader.vue";
import OverlayLockIndicator from "../features/overlay/components/OverlayLockIndicator.vue";
import OverlayErrors from "../features/overlay/components/OverlayErrors.vue";
import { useMapSettingsStore } from "../features/map/store";
import { useOverlayStore } from "../features/overlay/store";
import { useHotkeysStore } from "../features/hotkeys/store";
import { useTauriOverlay } from "../features/overlay/composables/useTauriOverlay";
import { useTransportStatus } from "../features/server/composables/useTransportStatus";
import { useGlobalShortcut } from "../features/hotkeys/composables/useGlobalShortcut";
import { useMapController } from "../features/map/composables/useMapController";
import { useCloseConfirm } from "../features/overlay/composables/useCloseConfirm";

const { mapCode } = storeToRefs(useMapSettingsStore());
const { clickThrough: overlayClickThrough } = storeToRefs(useOverlayStore());
const { lockHotkey, zoomInHotkey, zoomOutHotkey, floorUpHotkey, floorDownHotkey } =
  storeToRefs(useHotkeysStore());

const { isTauri } = useTauriOverlay();
const status = useTransportStatus();
const confirmClose = useCloseConfirm();

const mapDisplayName = ref<string>("…");
const mapError = ref<string | null>(null);
const extractsError = ref<string | null>(null);

// MapView publishes its imperative actions through provide/inject; until it
// mounts we get a no-op stub, so these handlers are safe to wire up before
// the map exists.
const map = useMapController();
useGlobalShortcut(isTauri, zoomInHotkey, () => map.zoomIn());
useGlobalShortcut(isTauri, zoomOutHotkey, () => map.zoomOut());
useGlobalShortcut(isTauri, floorUpHotkey, () => map.nextFloor());
useGlobalShortcut(isTauri, floorDownHotkey, () => map.prevFloor());
</script>

<template>
  <MapView
    :key="mapCode"
    :map-code="mapCode"
    @map-name="mapDisplayName = $event"
    @map-error="mapError = $event"
    @extracts-error="extractsError = $event"
  />

  <OverlayHeader
    :map-display-name="mapDisplayName"
    :status="status"
    :is-tauri="isTauri"
    :overlay-click-through="overlayClickThrough"
    @close="confirmClose"
  />

  <OverlayErrors :map-error="mapError" :extracts-error="extractsError" />

  <OverlayLockIndicator
    v-if="isTauri"
    :lock-hotkey="lockHotkey"
    :overlay-click-through="overlayClickThrough"
    @lock="overlayClickThrough = true"
  />
</template>
