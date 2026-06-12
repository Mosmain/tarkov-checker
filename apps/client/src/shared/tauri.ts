/**
 * Single source of truth for runtime Tauri detection.
 *
 * Tauri injects the `__TAURI_INTERNALS__` global synchronously into the
 * webview before user scripts run, so checking for it at module-evaluation
 * time is reliable across the codebase. The `typeof window` guard keeps
 * the file safe to import from non-DOM contexts (Vitest in node mode,
 * future SSR experiments).
 */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * DEV-only flag to render the Tauri overlay chrome (drag bar, animated border,
 * lock indicator) in a plain browser, so the overlay UX can be previewed and
 * iterated without a Tauri build. It ONLY flips render gates — native window
 * calls and the IPC transport still key off `isTauri`, so they stay no-ops off
 * real Tauri. Enable via `?overlay` in the URL or
 * localStorage['rm.dev.overlayChrome'] = '1'.
 */
function previewOverlayChrome(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  try {
    return (
      new URLSearchParams(window.location.search).has('overlay') ||
      window.localStorage.getItem('rm.dev.overlayChrome') === '1'
    );
  } catch {
    return false;
  }
}

export const showOverlayChrome = isTauri || previewOverlayChrome();
