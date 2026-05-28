import { serverMessage } from '@shared/ws-messages';
import { dispatchServerEvent } from './useServerEvents';

export type WsStatus = 'connecting' | 'open' | 'closed';

interface UseWebSocketResult {
  status: Ref<WsStatus>;
}

export function useWebSocket(url: string): UseWebSocketResult {
  const status = ref<WsStatus>('connecting');
  let socket: WebSocket | null = null;

  function connect(): void {
    socket = new WebSocket(url);
    status.value = 'connecting';

    socket.addEventListener('open', () => {
      status.value = 'open';
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        const result = serverMessage.safeParse(parsed);
        if (result.success) {
          dispatchServerEvent(result.data);
        }
      } catch {
        // Ignore malformed payloads; the server is the only sender.
      }
    });

    socket.addEventListener('close', () => {
      status.value = 'closed';
    });

    socket.addEventListener('error', () => {
      status.value = 'closed';
    });
  }

  onMounted(connect);

  onBeforeUnmount(() => {
    socket?.close();
    socket = null;
  });

  return { status };
}
