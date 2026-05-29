import type { MapChangeMessage, PositionMessage } from '@shared/ws-messages';
import { useServerStream } from './useServerStream';
import { dispatchServerEvent } from './useServerEvents';

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface UseServerTransport {
  status: Ref<TransportStatus>;
}

const isTauri = '__TAURI_INTERNALS__' in window;

// The Rust side emits each payload without its discriminator — the event
// channel name already carries that information, so the payload shape is the
// message minus its literal `type` field.
type PositionPayload = Omit<PositionMessage, 'type'>;
type MapChangePayload = Omit<MapChangeMessage, 'type'>;

/**
 * Single entry point for "server-pushed" messages — mount once at the app
 * root for side effects. Parsed messages are fanned out via the
 * `useServerEvents` bus; subscribers attach with `useServerEvent(type, ...)`
 * without prop-drilling through the component tree.
 *
 * - In Tauri: subscribes to the `position` and `map-change` events emitted
 *   by the Rust watchers. Status is hardcoded to `"open"` once listeners are
 *   attached — the same process owns both sides, so there isn't any
 *   meaningful "down" state to surface.
 * - In a plain browser (e.g. phone on the LAN): falls back to the LAN SSE
 *   stream (Node `apps/server` `GET /events`) on port 3000.
 */
export function useServerTransport(streamUrl: string): UseServerTransport {
  if (!isTauri) return useServerStream(streamUrl);

  const status = ref<TransportStatus>('connecting');
  let unlistens: Array<() => void> = [];

  onMounted(async () => {
    const { listen } = await import('@tauri-apps/api/event');
    unlistens.push(
      await listen<PositionPayload>('position', (event) => {
        dispatchServerEvent({ type: 'position', ...event.payload });
      }),
    );
    unlistens.push(
      await listen<MapChangePayload>('map-change', (event) => {
        dispatchServerEvent({ type: 'map-change', ...event.payload });
      }),
    );
    status.value = 'open';
  });

  onBeforeUnmount(() => {
    for (const off of unlistens) off();
    unlistens = [];
    status.value = 'closed';
  });

  return { status };
}
