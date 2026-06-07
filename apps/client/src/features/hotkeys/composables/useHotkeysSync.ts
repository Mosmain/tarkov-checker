import { useHotkeysStore } from '@/features/hotkeys/store';
import { HOTKEY_SUSPEND_EVENT, HOTKEY_RESUME_EVENT } from '../lib/hotkey';
import { suspendHotkeys, resumeHotkeys } from '@/features/server/api/hotkeys-api';
import { useServerEvent } from '@/features/server/composables/useServerEvents';

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

  // Another client rebound a combo → the backend broadcasts the effective
  // config over SSE; apply it so this client's view stays in sync (e.g. the
  // phone's read-only list). Browser/SSE only — the overlay is the rebind
  // surface and already updates from its own PUT response.
  useServerEvent('hotkeys', (msg) => store.applyConfig(msg.config));

  useEventListener(window, HOTKEY_SUSPEND_EVENT, () => {
    void suspendHotkeys().catch(() => {});
  });
  useEventListener(window, HOTKEY_RESUME_EVENT, () => {
    void resumeHotkeys().catch(() => {});
  });
}
