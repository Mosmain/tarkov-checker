import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, defineComponent, h, ref, type App } from 'vue';

// vi.mock factories are hoisted ABOVE top-level const declarations, so any
// shared `vi.fn()` they reference has to be hoisted too. The state holder for
// `isTauri` is declared with `let` so the closure reads it lazily — each
// suite flips the flag inside its own `beforeEach`.
const { listenMock, useServerStreamMock, dispatchServerEventMock } = vi.hoisted(() => ({
  listenMock: vi.fn(),
  useServerStreamMock: vi.fn(),
  dispatchServerEventMock: vi.fn(),
}));

let mockIsTauri = false;
vi.mock('@/shared/tauri', () => ({
  get isTauri() {
    return mockIsTauri;
  },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));
vi.mock('@/features/server/composables/useServerStream', () => ({
  useServerStream: useServerStreamMock,
}));
vi.mock('@/features/server/composables/useServerEvents', () => ({
  dispatchServerEvent: dispatchServerEventMock,
}));

import {
  useServerTransport,
  type UseServerTransport,
} from '@/features/server/composables/useServerTransport';

/**
 * Mount the composable inside a throwaway Vue app so onMounted /
 * onBeforeUnmount fire on cue. Returns the composable's return value plus an
 * `unmount()` to trigger teardown.
 */
function mountTransport(streamUrl: string): { result: UseServerTransport; app: App } {
  let captured: UseServerTransport | undefined;
  const Host = defineComponent({
    setup() {
      captured = useServerTransport(streamUrl);
      return () => h('div');
    },
  });
  const app = createApp(Host);
  app.mount(document.createElement('div'));
  return { result: captured as UseServerTransport, app };
}

/**
 * The composable's onMounted body chains a dynamic import and two awaited
 * `listen()` calls. Each awaits a microtask; loop until they've all settled
 * so test assertions see the post-mount steady state. Plain `nextTick()`
 * alone isn't enough — it flushes Vue's queue but not the awaits.
 */
async function flushMounted(): Promise<void> {
  await vi.dynamicImportSettled();
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  mockIsTauri = false;
  listenMock.mockReset();
  useServerStreamMock.mockReset();
  dispatchServerEventMock.mockReset();
});

describe('useServerTransport — browser path', () => {
  it('delegates straight to useServerStream and does not touch Tauri', () => {
    const fakeStream = { status: ref('connecting' as const) };
    useServerStreamMock.mockReturnValue(fakeStream);

    const { result } = mountTransport('/events');

    expect(useServerStreamMock).toHaveBeenCalledWith('/events');
    expect(result).toBe(fakeStream);
    expect(listenMock).not.toHaveBeenCalled();
  });
});

describe('useServerTransport — Tauri path', () => {
  beforeEach(() => {
    mockIsTauri = true;
  });

  it('subscribes to "position" and "map-change" and flips status to open', async () => {
    const off1 = vi.fn();
    const off2 = vi.fn();
    listenMock.mockResolvedValueOnce(off1).mockResolvedValueOnce(off2);

    const { result } = mountTransport('/events');
    expect(result.status.value).toBe('connecting');

    await flushMounted();

    expect(listenMock).toHaveBeenCalledTimes(2);
    expect(listenMock.mock.calls[0]![0]).toBe('position');
    expect(listenMock.mock.calls[1]![0]).toBe('map-change');
    expect(result.status.value).toBe('open');
    expect(useServerStreamMock).not.toHaveBeenCalled();
  });

  it('validates incoming position payloads through zod and drops invalid ones', async () => {
    let positionHandler: ((event: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementationOnce(async (_name: string, handler) => {
      positionHandler = handler;
      return vi.fn();
    });
    listenMock.mockResolvedValueOnce(vi.fn());

    mountTransport('/events');
    await flushMounted();

    expect(positionHandler).not.toBeNull();

    positionHandler!({ payload: { t: 100, x: 1, y: 2, z: 3, yaw: 90 } });
    expect(dispatchServerEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchServerEventMock).toHaveBeenCalledWith({
      type: 'position',
      t: 100,
      x: 1,
      y: 2,
      z: 3,
      yaw: 90,
    });

    positionHandler!({ payload: { t: 200, y: 0, z: 0 } }); // missing x
    expect(dispatchServerEventMock).toHaveBeenCalledTimes(1);
  });

  it('validates map-change payloads and drops unparseable shapes', async () => {
    listenMock.mockResolvedValueOnce(vi.fn());
    let mapHandler: ((event: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementationOnce(async (_name: string, handler) => {
      mapHandler = handler;
      return vi.fn();
    });

    mountTransport('/events');
    await flushMounted();

    expect(mapHandler).not.toBeNull();

    mapHandler!({ payload: { t: 1, rawMapId: 'bigmap' } });
    expect(dispatchServerEventMock).toHaveBeenCalledWith({
      type: 'map-change',
      t: 1,
      rawMapId: 'bigmap',
    });

    dispatchServerEventMock.mockClear();
    mapHandler!({ payload: { rawMapId: 'bigmap' } }); // missing t
    expect(dispatchServerEventMock).not.toHaveBeenCalled();
  });

  it('calls every unlisten and flips status to closed on unmount', async () => {
    const off1 = vi.fn();
    const off2 = vi.fn();
    listenMock.mockResolvedValueOnce(off1).mockResolvedValueOnce(off2);

    const { result, app } = mountTransport('/events');
    await flushMounted();
    expect(result.status.value).toBe('open');

    app.unmount();

    expect(off1).toHaveBeenCalledTimes(1);
    expect(off2).toHaveBeenCalledTimes(1);
    expect(result.status.value).toBe('closed');
  });
});
