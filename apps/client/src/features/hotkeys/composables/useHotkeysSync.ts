import { useHotkeysStore } from '@/features/hotkeys/store';
import { HOTKEY_SUSPEND_EVENT, HOTKEY_RESUME_EVENT } from '../lib/hotkey';
import { suspendHotkeys, resumeHotkeys } from '@/features/server/api/hotkeys-api';

/**
 * Mount once at the app root. Loads the backend-owned hotkey combos into the
 * store and bridges the settings recorder's suspend/resume window events to
 * the backend: while a recorder captures, the backend must drop its OS-global
 * binds so the pressed combo reaches the page/webview instead of firing its
 * action (the backend, not the browser, now holds those binds). The same
 * window events still drive the client-side lock shortcut via `useGlobalShortcut`.
 */
export function useHotkeysSync(): void {
  const store = useHotkeysStore();

  onMounted(() => {
    // Best-effort — a closed transport just leaves the defaults in place.
    void store.load().catch(() => {});
  });

  useEventListener(window, HOTKEY_SUSPEND_EVENT, () => {
    void suspendHotkeys().catch(() => {});
  });
  useEventListener(window, HOTKEY_RESUME_EVENT, () => {
    void resumeHotkeys().catch(() => {});
  });
}
