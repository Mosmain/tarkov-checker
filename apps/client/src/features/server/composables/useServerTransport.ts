import {
  commandMessage,
  mapChangeMessage,
  positionMessage,
  type CommandMessage,
  type MapChangeMessage,
  type PositionMessage,
} from '@shared/ws-messages';
import { isTauri } from '@/shared/tauri';
import { useServerStream } from './useServerStream';
import { dispatchServerEvent } from './useServerEvents';

export type TransportStatus = 'connecting' | 'open' | 'closed';

export interface UseServerTransport {
  status: Ref<TransportStatus>;
}

// The Rust side emits each payload without its discriminator — the event
// channel name already carries that information, so the payload shape is the
// message minus its literal `type` field.
type PositionPayload = Omit<PositionMessage, 'type'>;
type MapChangePayload = Omit<MapChangeMessage, 'type'>;
type CommandPayload = Omit<CommandMessage, 'type'>;

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
 * - In a plain browser (the hosted-frontend or LAN-phone scenario):
 *   falls back to the local Rust helper's SSE stream
 *   (`GET /events` on `127.0.0.1:47474`, Vite-proxied in dev).
 */
export function useServerTransport(streamUrl: string): UseServerTransport {
  if (!isTauri) return useServerStream(streamUrl);

  const status = ref<TransportStatus>('connecting');
  let unlistens: Array<() => void> = [];

  onMounted(async () => {
    const { listen } = await import('@tauri-apps/api/event');
    // The Tauri payload type is hand-kept in parity with the Rust side
    // (see CLAUDE.md "Desktop overlay's in-process server"). Validate at the
    // boundary so a shape drift surfaces as a dropped event, not as
    // `undefined.toFixed()` deep in downstream code.
    unlistens.push(
      await listen<PositionPayload>('position', (event) => {
        const parsed = positionMessage.safeParse({ type: 'position', ...event.payload });
        if (parsed.success) dispatchServerEvent(parsed.data);
      }),
    );
    unlistens.push(
      await listen<MapChangePayload>('map-change', (event) => {
        const parsed = mapChangeMessage.safeParse({ type: 'map-change', ...event.payload });
        if (parsed.success) dispatchServerEvent(parsed.data);
      }),
    );
    // Backend-owned global hotkey presses. The browser/SSE path gets these
    // for free via the discriminated union in `useServerStream`; the Tauri
    // path needs its own listener because Rust emits via `app.emit`.
    unlistens.push(
      await listen<CommandPayload>('command', (event) => {
        const parsed = commandMessage.safeParse({ type: 'command', ...event.payload });
        if (parsed.success) dispatchServerEvent(parsed.data);
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
