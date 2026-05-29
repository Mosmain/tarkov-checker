import type { PositionMessage } from '@shared/ws-messages';
import { useServerStream } from './useServerStream';
import { dispatchServerEvent } from './useServerEvents';

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface UseServerTransport {
  status: Ref<TransportStatus>;
}

const isTauri = '__TAURI_INTERNALS__' in window;

// The Rust side emits the position payload without the discriminator — the
// event channel name ("position") already carries that information, so the
// payload shape is PositionMessage minus the literal `type` field.
type PositionPayload = Omit<PositionMessage, 'type'>;

/**
 * Single entry point for "server-pushed" messages — mount once at the app
 * root for side effects. Parsed messages are fanned out via the
 * `useServerEvents` bus; subscribers attach with `useServerEvent(type, ...)`
 * without prop-drilling through the component tree.
 *
 * - In Tauri: subscribes to the `position` event emitted by the Rust
 *   screenshot watcher. Status is hardcoded to `"open"` once listeners are
 *   attached — the same process owns both sides, so there isn't any
 *   meaningful "down" state to surface.
 * - In a plain browser (PWA on phone): falls back to the LAN SSE stream
 *   (Node `apps/server` `GET /events`) on port 3000.
 */
export function useServerTransport(streamUrl: string): UseServerTransport {
  if (!isTauri) return useServerStream(streamUrl);

  const status = ref<TransportStatus>('connecting');
  let unlisten: (() => void) | null = null;

  onMounted(async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const handle = await listen<PositionPayload>('position', (event) => {
      dispatchServerEvent({ type: 'position', ...event.payload });
    });
    unlisten = handle;
    status.value = 'open';
  });

  onBeforeUnmount(() => {
    unlisten?.();
    unlisten = null;
    status.value = 'closed';
  });

  return { status };
}
