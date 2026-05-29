<script setup lang="ts">
import MapQuickMenu from '@/features/overlay/components/MapQuickMenu.vue';
import { useServerTransport } from '@/features/server/composables/useServerTransport';
import { provideTransportStatus } from '@/features/server/composables/useTransportStatus';
import { useOverlayStore } from '@/features/overlay/store';
import { useHotkeysStore } from '@/features/hotkeys/store';
import { useTauriOverlay } from '@/features/overlay/composables/useTauriOverlay';
import { useGlobalShortcut } from '@/features/hotkeys/composables/useGlobalShortcut';
import { useTrayIcon } from '@/features/overlay/composables/useTrayIcon';
import { useOverlayBootstrap } from '@/features/overlay/composables/useOverlayBootstrap';
import { eventsUrl } from '@/shared/config';

const { clickThrough: overlayClickThrough } = storeToRefs(useOverlayStore());
const { lockHotkey } = storeToRefs(useHotkeysStore());

const { isTauri } = useTauriOverlay();

// Browser/PWA mode talks to the LAN Node server over SSE; Tauri mode shortcuts
// that layer and listens for Rust-emitted events directly.
const { status } = useServerTransport(eventsUrl());
provideTransportStatus(status);

// Lock toggle is the only truly global hotkey — every other map-specific
// shortcut lives inside OverlayView, scoped to that route.
useGlobalShortcut(isTauri, lockHotkey, () => {
  overlayClickThrough.value = !overlayClickThrough.value;
});

useOverlayBootstrap(overlayClickThrough);
useTrayIcon(isTauri, overlayClickThrough);

const quickMenu = ref<InstanceType<typeof MapQuickMenu> | null>(null);

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
  <div
    class="relative h-screen w-screen text-surface-0"
    :class="isTauri ? '' : 'bg-surface-950'"
    @contextmenu="onMapContextMenu"
  >
    <RouterView />
  </div>
</template>
