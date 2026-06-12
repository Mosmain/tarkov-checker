import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

const overlayZoomSchema = z.enum(['75', '100', '125', '150']);
export type OverlayZoom = z.infer<typeof overlayZoomSchema>;

export const useOverlayStore = defineStore('overlay', () => {
  const alwaysOnTop = persistedRef('rm.overlay.alwaysOnTop', z.boolean(), false);
  const opacity = persistedRef('rm.overlay.opacity', z.number().min(0.3).max(1), 1);
  const mapOpacity = persistedRef('rm.overlay.mapOpacity', z.number().min(0).max(1), 1);
  const zoom = persistedRef('rm.overlay.zoom', overlayZoomSchema, '100' as OverlayZoom);

  // When on, the ✕ button hides the window to the system tray (keeps running)
  // instead of quitting; restore via the tray's "Show window", quit via the
  // tray's "Quit". Default ON — closing parks the overlay in the tray rather
  // than killing the session. Users who prefer ✕ = confirmed quit can flip it
  // off in Settings.
  const minimizeToTray = persistedRef('rm.overlay.minimizeToTray', z.boolean(), true);

  // One-shot: tracks whether the "still running in the tray" notification has
  // been shown. Set true after the first close-to-tray so the hint fires once,
  // not on every ✕.
  const trayHintShown = persistedRef('rm.overlay.trayHintShown', z.boolean(), false);

  // Session-only: booting into a locked overlay with a broken hotkey would be
  // unrecoverable, so the locked state is intentionally NOT persisted.
  const clickThrough = ref(false);

  // Pairing modal open/closed. Flipped by the tray's "Pair phone" item
  // (E4) and read by PairingModal.vue mounted at App.vue. Not
  // persisted — pairing is per-action, never "remembered open".
  const pairingModalOpen = ref(false);

  return {
    alwaysOnTop,
    opacity,
    mapOpacity,
    zoom,
    minimizeToTray,
    trayHintShown,
    clickThrough,
    pairingModalOpen,
  };
});
