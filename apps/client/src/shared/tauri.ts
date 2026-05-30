/**
 * Single source of truth for runtime Tauri detection.
 *
 * Tauri injects the `__TAURI_INTERNALS__` global synchronously into the
 * webview before user scripts run, so checking for it at module-evaluation
 * time is reliable across the codebase. The `typeof window` guard keeps
 * the file safe to import from non-DOM contexts (Vitest in node mode,
 * future SSR experiments).
 */
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
