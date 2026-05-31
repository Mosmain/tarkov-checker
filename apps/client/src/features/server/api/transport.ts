/**
 * Single dispatch point for client→backend reads/writes. The same client code
 * runs both inside the Tauri overlay and as a plain browser page:
 *
 * - In Tauri: invokes a named IPC command via `@tauri-apps/api/core`.
 * - In a plain browser: makes a same-origin HTTP call (Vite proxies /api to
 *   Fastify in dev; Fastify serves both the SPA and /api in prod).
 *
 * The raw response is fed through `parse` (typically a zod schema's `.parse`)
 * so callers get a validated, typed result either way.
 */

import { getAuthToken } from '@/shared/auth';
import { apiBase } from '@/shared/config';
import { isTauri } from '@/shared/tauri';
import type { IpcContract } from './ipc-contract';

export interface HttpCall {
  method?: 'GET' | 'PUT' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

/**
 * A call to one IPC command. `cmd` is keyof IpcContract — opt-in narrowing
 * gives a typo on the command name a compile-time error, and `args`/`parse`
 * line up with the contract's declared shapes per command.
 */
export type BackendCall<K extends keyof IpcContract> = {
  tauri: { cmd: K } & (IpcContract[K]['args'] extends undefined
    ? { args?: undefined }
    : { args: IpcContract[K]['args'] });
  http: HttpCall;
  parse: (data: unknown) => IpcContract[K]['result'];
};

export async function callBackend<K extends keyof IpcContract>(
  call: BackendCall<K>,
): Promise<IpcContract[K]['result']> {
  if (isTauri) {
    // Lazy-import so the @tauri-apps/api chunk only loads when actually
    // running inside Tauri.
    const { invoke } = await import('@tauri-apps/api/core');
    const data = await invoke<unknown>(
      call.tauri.cmd,
      call.tauri.args as Record<string, unknown> | undefined,
    );
    return call.parse(data);
  }
  return httpRequest(call.http, call.parse);
}

async function httpRequest<T>(http: HttpCall, parse: (data: unknown) => T): Promise<T> {
  const method = http.method ?? 'GET';
  const qs = http.query ? '?' + new URLSearchParams(http.query).toString() : '';
  const headers: Record<string, string> = {};
  if (http.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Attach the bearer token when we have one. The helper accepts the
  // header on every route; it's only ENFORCED when LAN mode is on, so
  // sending it in LAN-off mode is harmless. /api/ping uses the same
  // header to compute its `paired` flag — see http_server.rs ping.
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (http.body !== undefined) {
    init.body = JSON.stringify(http.body);
  }
  const r = await fetch(`${apiBase()}${http.path}${qs}`, init);
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => ({}));
    const detail = typeof body === 'object' && body !== null && 'error' in body ? body.error : body;
    throw new Error(`${method} ${http.path} failed: HTTP ${r.status} — ${JSON.stringify(detail)}`);
  }
  return parse(await r.json());
}
