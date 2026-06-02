<script setup lang="ts">
import MapQuickMenu from '@/features/overlay/components/MapQuickMenu.vue';
import PairingModal from '@/features/overlay/components/PairingModal.vue';
import { useServerTransport } from '@/features/server/composables/useServerTransport';
import { provideTransportStatus } from '@/features/server/composables/useTransportStatus';
import { useOverlayStore } from '@/features/overlay/store';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { useTauriOverlay } from '@/features/overlay/composables/useTauriOverlay';
import { useGlobalShortcut } from '@/features/hotkeys/composables/useGlobalShortcut';
import { useHotkeysSync } from '@/features/hotkeys/composables/useHotkeysSync';
import { useTrayIcon } from '@/features/overlay/composables/useTrayIcon';
import { useOverlayBootstrap } from '@/features/overlay/composables/useOverlayBootstrap';
import { useAutoMapSwitch } from '@/features/map/composables/useAutoMapSwitch';
import { eventsUrl } from '@/shared/config';
import { useConfirm } from 'primevue/useconfirm';

const { clickThrough: overlayClickThrough } = storeToRefs(useOverlayStore());
const { lockHotkey } = storeToRefs(useHotkeysStore());

const { isTauri } = useTauriOverlay();

// Browser mode talks to the LAN Node server over SSE; Tauri mode shortcuts
// that layer and listens for Rust-emitted events directly.
const { status } = useServerTransport(eventsUrl());
provideTransportStatus(status);

// Subscribe once at the app root so map-change events flip mapSettingsStore
// regardless of which route is currently mounted.
useAutoMapSwitch();

// Lock toggle stays a client-side global shortcut: it's an overlay window op
// (click-through) with no browser meaning, and keeping it on the proven plugin
// path preserves the recovery route out of a click-through lockout. Every other
// hotkey is backend-owned and arrives as a `command` event (see index.vue).
useGlobalShortcut(isTauri, lockHotkey, () => {
  overlayClickThrough.value = !overlayClickThrough.value;
});

// Load backend-owned combos into the store + bridge the recorder's
// suspend/resume to the backend (so a combo can be re-recorded).
useHotkeysSync();

useOverlayBootstrap(overlayClickThrough);
useTrayIcon(isTauri, overlayClickThrough);

const confirm = useConfirm();
const quickMenu = ref<InstanceType<typeof MapQuickMenu> | null>(null);

// Close transient UI when the overlay locks so click-through can't strand them.
watch(overlayClickThrough, (locked) => {
  if (locked) {
    confirm.close();
    quickMenu.value?.close();
  }
});

// Right-click anywhere over the Leaflet canvas opens the transparency panel.
// Lives at the app root so the same gesture works regardless of which route
// is mounted underneath.
function onMapContextMenu(event: MouseEvent): void {
  if (!isTauri) return;
  const target = event.target as HTMLElement | null;
  if (!target?.closest('.leaflet-container')) return;
  event.preventDefault();
  quickMenu.value?.open(event.clientX, event.clientY);
}
</script>

<template>
  <ConfirmDialog />
  <MapQuickMenu ref="quickMenu" />
  <!--
    PairingModal only makes sense inside the Tauri webview — its
    `invoke('pairing_qr')` call needs the IPC bridge. In a plain
    browser context the modal would just error on open, so we don't
    mount it at all there.
  -->
  <PairingModal v-if="isTauri" />
  <div
    class="relative h-dvh w-screen text-surface-0"
    :class="isTauri ? '' : 'bg-surface-950'"
    @contextmenu="onMapContextMenu"
  >
    <RouterView />
  </div>
</template>
