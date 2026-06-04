import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

const overlayZoomSchema = z.enum(['75', '100', '125', '150']);
export type OverlayZoom = z.infer<typeof overlayZoomSchema>;

export const useOverlayStore = defineStore('overlay', () => {
  const alwaysOnTop = persistedRef('tc.overlay.alwaysOnTop', z.boolean(), false);
  const opacity = persistedRef('tc.overlay.opacity', z.number().min(0.3).max(1), 1);
  const mapOpacity = persistedRef('tc.overlay.mapOpacity', z.number().min(0).max(1), 1);
  const zoom = persistedRef('tc.overlay.zoom', overlayZoomSchema, '100' as OverlayZoom);

  // When on, the ✕ button hides the window to the system tray (keeps running)
  // instead of quitting; restore/quit from the tray. Opt-in — default off keeps
  // the ✕ as a confirmed quit.
  const minimizeToTray = persistedRef('tc.overlay.minimizeToTray', z.boolean(), false);

  // Session-only: booting into a locked overlay with a broken hotkey would be
  // unrecoverable, so the locked state is intentionally NOT persisted.
  const clickThrough = ref(false);

  // Pairing modal open/closed. Flipped by the tray's "Pair phone" item
  // (E4) and read by PairingModal.vue mounted at App.vue. Not
  // persisted — pairing is per-action, never "remembered open".
  const pairingModalOpen = ref(false);

  return { alwaysOnTop, opacity, mapOpacity, zoom, minimizeToTray, clickThrough, pairingModalOpen };
});
