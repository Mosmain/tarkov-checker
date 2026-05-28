import { useTauriOverlay } from "./useTauriOverlay";

/**
 * One-shot Tauri overlay init:
 * - Force-resets click-through to false on startup. The locked state is
 *   intentionally non-persistent — booting into a locked window with a
 *   broken hotkey would be unrecoverable.
 * - Mirrors `overlayClickThrough` into the native window via
 *   setIgnoreCursorEvents.
 * - Adds the `overlay-window` class to <html> for the rounded-corner clip
 *   (CSS rule lives in styles.css).
 *
 * No-op in browser context.
 */
export function useOverlayBootstrap(overlayClickThrough: Ref<boolean>): void {
  const overlay = useTauriOverlay();
  if (!overlay.isTauri) return;

  overlayClickThrough.value = false;
  void overlay.setClickThrough(false);
  watch(overlayClickThrough, (locked) => void overlay.setClickThrough(locked));
  document.documentElement.classList.add("overlay-window");
}
