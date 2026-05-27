import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";
import type { ServerMessage } from "@shared/ws-messages";
import { useWebSocket } from "./useWebSocket";

export type TransportStatus = "connecting" | "open" | "closed";

export interface UseServerTransport {
  status: Ref<TransportStatus>;
  lastMessage: Ref<ServerMessage | null>;
}

const isTauri = "__TAURI_INTERNALS__" in window;

interface PositionPayload {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number | null;
}

/**
 * Single entry point for "server-pushed" messages.
 *
 * - In Tauri: subscribes to the `position` event emitted by the Rust
 *   screenshot watcher. Transport status is hardcoded to `"open"` once
 *   listeners are attached — the same process owns both sides, so there
 *   isn't any meaningful "down" state to surface.
 * - In a plain browser (PWA on phone): falls back to the LAN WebSocket
 *   server (Node `apps/server`) on port 3000.
 */
export function useServerTransport(wsUrl: string): UseServerTransport {
  if (!isTauri) return useWebSocket(wsUrl);

  const status = ref<TransportStatus>("connecting");
  const lastMessage = ref<ServerMessage | null>(null);
  let unlisten: (() => void) | null = null;

  onMounted(async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const handle = await listen<PositionPayload>("position", (event) => {
      const p = event.payload;
      lastMessage.value = {
        type: "position",
        t: p.t,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
      };
    });
    unlisten = handle;
    status.value = "open";
  });

  onBeforeUnmount(() => {
    unlisten?.();
    unlisten = null;
    status.value = "closed";
  });

  return { status, lastMessage };
}
