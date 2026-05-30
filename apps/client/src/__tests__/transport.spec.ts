import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

// `callBackend` reads `isTauri` from `@/shared/tauri` at call time. The mock
// is dynamic so individual tests can flip it on/off without reloading the
// module graph.
let mockIsTauri = false;
vi.mock('@/shared/tauri', () => ({
  get isTauri() {
    return mockIsTauri;
  },
}));

// `@tauri-apps/api/core` is `await import`ed inside the Tauri branch. We mock
// it so it never tries to actually call into a Tauri runtime.
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import { callBackend } from '@/features/server/api/transport';

const echoSchema = z.object({ greeting: z.string() });
type EchoResult = z.infer<typeof echoSchema>;

const fetchMock = vi.fn();

beforeEach(() => {
  mockIsTauri = false;
  mockInvoke.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('callBackend — Tauri path', () => {
  beforeEach(() => {
    mockIsTauri = true;
  });

  it('invokes the IPC command with declared args and parses the result', async () => {
    mockInvoke.mockResolvedValueOnce({ greeting: 'hi' });

    const result = await callBackend({
      tauri: { cmd: 'get_config' },
      http: { path: '/api/config' },
      parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
    } as never);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('get_config', undefined);
    expect(result).toEqual({ greeting: 'hi' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards explicit args to invoke', async () => {
    mockInvoke.mockResolvedValueOnce({ greeting: 'ok' });

    await callBackend({
      tauri: { cmd: 'update_config', args: { patch: { gameDir: 'C:\\X' } } },
      http: { path: '/api/config' },
      parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
    } as never);

    expect(mockInvoke).toHaveBeenCalledWith('update_config', {
      patch: { gameDir: 'C:\\X' },
    });
  });

  it('rejects when the parse function throws', async () => {
    mockInvoke.mockResolvedValueOnce({ wrong: 'shape' });

    await expect(
      callBackend({
        tauri: { cmd: 'get_config' },
        http: { path: '/api/config' },
        parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
      } as never),
    ).rejects.toThrow();
  });
});

describe('callBackend — browser path', () => {
  it('issues a GET to the http.path and parses the response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ greeting: 'web' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await callBackend({
      tauri: { cmd: 'get_config' },
      http: { path: '/api/config' },
      parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/config');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).body).toBeUndefined();
    expect(result).toEqual({ greeting: 'web' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('serialises body and sets JSON content-type for PUT', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ greeting: 'saved' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await callBackend({
      tauri: { cmd: 'update_config', args: { patch: {} } },
      http: { method: 'PUT', path: '/api/config', body: { patch: { gameDir: 'X' } } },
      parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
    } as never);

    const [, init] = fetchMock.mock.calls[0]!;
    const i = init as RequestInit;
    expect(i.method).toBe('PUT');
    expect(JSON.parse(i.body as string)).toEqual({ patch: { gameDir: 'X' } });
    const headers = i.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('appends query parameters when provided', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ greeting: 'q' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await callBackend({
      tauri: { cmd: 'get_config' },
      http: { path: '/api/config', query: { kind: 'paths', verbose: 'true' } },
      parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
    } as never);

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/^\/api\/config\?/);
    expect(url).toContain('kind=paths');
    expect(url).toContain('verbose=true');
  });

  it('throws an informative error on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      callBackend({
        tauri: { cmd: 'get_config' },
        http: { method: 'POST', path: '/api/config' },
        parse: (data: unknown) => echoSchema.parse(data) as unknown as EchoResult,
      } as never),
    ).rejects.toThrow(/POST \/api\/config failed: HTTP 400/);
  });
});
