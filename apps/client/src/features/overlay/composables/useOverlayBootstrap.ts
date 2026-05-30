import { useOverlayStore } from '../store';
import { useTauriOverlay } from './useTauriOverlay';

/**
 * App-lifetime overlay init. Mounts once at App.vue root so persisted overlay
 * settings stay in sync with the native window regardless of which Vue scope
 * is alive (Settings drawer open/closed, current route, etc.).
 *
 * Responsibilities:
 * - Force-reset click-through to false on startup — the locked state is
 *   intentionally non-persistent because booting into a locked window with a
 *   broken hotkey would be unrecoverable.
 * - Replay all persisted overlay settings into the native window on boot
 *   (alwaysOnTop, opacity, zoom) and into the `--map-bg-alpha` CSS variable.
 *   Without this, the visible state would only catch up the first time the
 *   user opens the Settings drawer (where useOverlaySync used to do it),
 *   making it look like "settings don't save".
 * - Persistent watchers from store → native, so changes from anywhere
 *   (Settings drawer, right-click quick menu, hotkeys, future surfaces)
 *   propagate even when the originating component is unmounted.
 * - Adds the `overlay-window` class to <html> for the rounded-corner clip
 *   (CSS rule lives in styles.css).
 *
 * No-op for the click-through and Tauri-window parts in browser context;
 * `--map-bg-alpha` is set in both contexts so the LAN-browser view still
 * honours the map opacity preference.
 */
export function useOverlayBootstrap(overlayClickThrough: Ref<boolean>): void {
  const overlay = useTauriOverlay();
  const { alwaysOnTop, opacity, mapOpacity, zoom } = storeToRefs(useOverlayStore());

  function applyMapBgAlpha(): void {
    // When overall opacity is 100% the map MUST also render opaque — a
    // transparent map background behind a fully opaque overlay would look
    // like a hole. The Settings UI mirrors this with a disabled-slider hint.
    const effective = opacity.value < 1 ? mapOpacity.value : 1;
    document.documentElement.style.setProperty('--map-bg-alpha', String(effective));
  }
  applyMapBgAlpha();
  watch([opacity, mapOpacity], applyMapBgAlpha);

  if (!overlay.isTauri) return;

  overlayClickThrough.value = false;
  void overlay.setClickThrough(false);
  watch(overlayClickThrough, (locked) => void overlay.setClickThrough(locked));
  document.documentElement.classList.add('overlay-window');

  // `overlay-unlocked` class drives the visible window border (see styles.css).
  // The locked state never shows the border — the lock indicator alone says
  // "can't interact", and the border would be wasted ink. Sync initially +
  // on every flip so the visual matches the actual interaction mode.
  function syncUnlockedClass(locked: boolean): void {
    document.documentElement.classList.toggle('overlay-unlocked', !locked);
  }
  syncUnlockedClass(overlayClickThrough.value);
  watch(overlayClickThrough, syncUnlockedClass);

  // Replay persisted values to the native window before the user interacts
  // with anything. Same calls fire on each subsequent store change.
  void overlay.setAlwaysOnTop(alwaysOnTop.value);
  void overlay.setOpacity(opacity.value);
  void overlay.setZoom(Number(zoom.value) / 100);
  watch(alwaysOnTop, (v) => void overlay.setAlwaysOnTop(v));
  watch(opacity, (v) => void overlay.setOpacity(v));
  watch(zoom, (v) => void overlay.setZoom(Number(v) / 100));
}
