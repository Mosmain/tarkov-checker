import type { ServerMessage, ServerMessageType } from '@shared/sse-messages';

type EventMap = {
  [K in ServerMessageType]: Extract<ServerMessage, { type: K }>;
};

type Handler<K extends ServerMessageType> = (msg: EventMap[K]) => void;

/**
 * Module-level subscriber registry. Lives outside Vue's lifecycle so it
 * survives component remounts (e.g. when a route swaps the map view in and
 * out — subscribers re-attach via onScopeDispose, but the bus itself stays).
 */
const handlers = new Map<ServerMessageType, Set<Handler<ServerMessageType>>>();

/**
 * Fan-out: invoked by the transport layer (useServerTransport / useWebSocket)
 * each time a parsed server message arrives. Synchronous — handlers run in
 * registration order on the dispatching tick.
 */
export function dispatchServerEvent<K extends ServerMessageType>(msg: EventMap[K]): void {
  const set = handlers.get(msg.type);
  if (!set) return;
  for (const h of set) (h as Handler<K>)(msg);
}

/**
 * Manual subscription. Returns an `off()` function. Prefer `useServerEvent`
 * inside components — this is for non-component contexts (e.g. stores).
 */
export function onServerEvent<K extends ServerMessageType>(
  type: K,
  handler: Handler<K>,
): () => void {
  let set = handlers.get(type);
  if (!set) {
    set = new Set();
    handlers.set(type, set);
  }
  const erased = handler as Handler<ServerMessageType>;
  set.add(erased);
  return () => {
    set!.delete(erased);
  };
}

/**
 * Lifecycle-aware subscription. Auto-unsubscribes when the surrounding
 * effect scope disposes (component unmount, EffectScope.stop, etc.).
 * Subscription is active immediately — no onMounted delay.
 */
export function useServerEvent<K extends ServerMessageType>(type: K, handler: Handler<K>): void {
  const off = onServerEvent(type, handler);
  onScopeDispose(off);
}
