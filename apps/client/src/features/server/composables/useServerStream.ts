import { serverMessage } from '@shared/ws-messages';
import { dispatchServerEvent } from './useServerEvents';

export type StreamStatus = 'connecting' | 'open' | 'closed';

interface UseServerStreamResult {
  status: Ref<StreamStatus>;
}

/**
 * Browser transport: a Server-Sent Events stream from the local Rust
 * helper (`apps/desktop/src-tauri` exposes `GET /events` on
 * `127.0.0.1:47474`; in dev mode Vite proxies same-origin `/events`
 * onto it). EventSource reconnects automatically on transport errors —
 * that built-in retry is the whole point of using SSE here.
 */
export function useServerStream(url: string): UseServerStreamResult {
  const status = ref<StreamStatus>('connecting');
  let source: EventSource | null = null;

  function connect(): void {
    source = new EventSource(url);
    status.value = 'connecting';

    source.addEventListener('open', () => {
      status.value = 'open';
    });

    source.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        const result = serverMessage.safeParse(parsed);
        if (result.success) {
          dispatchServerEvent(result.data);
        }
      } catch {
        // Ignore malformed payloads; the server is the only sender. Keepalive
        // comments (": ping") never surface as message events.
      }
    });

    // EventSource fires `error` on a dropped connection but keeps retrying
    // (readyState flips back to CONNECTING). Surface "connecting" for that
    // transient case; only a source closed via close() reads as terminal.
    source.addEventListener('error', () => {
      status.value = source?.readyState === EventSource.CLOSED ? 'closed' : 'connecting';
    });
  }

  onMounted(connect);

  onBeforeUnmount(() => {
    source?.close();
    source = null;
    status.value = 'closed';
  });

  return { status };
}
