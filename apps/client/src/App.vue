<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import ConfirmDialog from "primevue/confirmdialog";
import MapView from "./components/MapView.vue";
import MapQuickMenu from "./components/MapQuickMenu.vue";
import OverlayHeader from "./components/overlay/OverlayHeader.vue";
import OverlayLockIndicator from "./components/overlay/OverlayLockIndicator.vue";
import OverlayErrors from "./components/overlay/OverlayErrors.vue";
import { useServerTransport } from "./composables/useServerTransport";
import { useSettingsStore } from "./stores/settings";
import { useTauriOverlay } from "./composables/useTauriOverlay";
import { useGlobalShortcut } from "./composables/useGlobalShortcut";
import { useTrayIcon } from "./composables/useTrayIcon";
import { useOverlayBootstrap } from "./composables/useOverlayBootstrap";
import { useCloseConfirm } from "./composables/useCloseConfirm";

const settings = useSettingsStore();
const {
  mapCode,
  overlayClickThrough,
  lockHotkey,
  zoomInHotkey,
  zoomOutHotkey,
  floorUpHotkey,
  floorDownHotkey,
} = storeToRefs(settings);

const mapDisplayName = ref<string>("…");
const mapError = ref<string | null>(null);
const extractsError = ref<string | null>(null);

// Browser/PWA mode talks to the LAN Node server on :3000; Tauri mode
// shortcuts the WS layer and listens for Rust-emitted events directly.
const wsUrl = `ws://${window.location.hostname}:3000/ws`;
const { status, lastMessage } = useServerTransport(wsUrl);
const { isTauri } = useTauriOverlay();

// MapView's imperative methods (zoomIn/zoomOut/nextFloor/prevFloor) are
// exposed via defineExpose so the global hotkeys below can drive them.
const mapViewRef = ref<InstanceType<typeof MapView> | null>(null);

useGlobalShortcut(isTauri, lockHotkey, () => {
  overlayClickThrough.value = !overlayClickThrough.value;
});
useGlobalShortcut(isTauri, zoomInHotkey, () => mapViewRef.value?.zoomIn());
useGlobalShortcut(isTauri, zoomOutHotkey, () => mapViewRef.value?.zoomOut());
useGlobalShortcut(isTauri, floorUpHotkey, () => mapViewRef.value?.nextFloor());
useGlobalShortcut(isTauri, floorDownHotkey, () => mapViewRef.value?.prevFloor());

useOverlayBootstrap(overlayClickThrough);
useTrayIcon(isTauri, overlayClickThrough);
const confirmClose = useCloseConfirm();

const quickMenu = ref<InstanceType<typeof MapQuickMenu> | null>(null);

// Right-click on the map area opens the quick transparency panel. Tauri-only;
// in the browser the native context menu behaves normally.
function onMapContextMenu(event: MouseEvent): void {
  if (!isTauri) return;
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".leaflet-container")) return;
  event.preventDefault();
  quickMenu.value?.open(event.clientX, event.clientY);
}
</script>

<template>
  <ConfirmDialog />
  <MapQuickMenu ref="quickMenu" />
  <div
    class="relative h-screen w-screen text-surface-0"
    :class="isTauri ? '' : 'bg-surface-950'"
    @contextmenu="onMapContextMenu"
  >
    <MapView
      ref="mapViewRef"
      :key="mapCode"
      :map-code="mapCode"
      :last-message="lastMessage"
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
  </div>
</template>
