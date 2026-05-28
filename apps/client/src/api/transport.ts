/**
 * Single dispatch point for client→backend reads/writes. The same client code
 * runs both inside the Tauri overlay and as a plain browser PWA:
 *
 * - In Tauri: invokes a named IPC command via `@tauri-apps/api/core`.
 * - In a plain browser: calls the LAN Node server (apps/server) at :3000
 *   with the given HTTP method/path/body/query.
 *
 * The raw response is fed through `parse` (typically a zod schema's `.parse`)
 * so callers get a validated, typed result either way.
 */

const isTauri = "__TAURI_INTERNALS__" in window;

function apiBase(): string {
  return `http://${window.location.hostname}:3000`;
}

export interface TauriCall {
  cmd: string;
  args?: Record<string, unknown>;
}

export interface HttpCall {
  method?: "GET" | "PUT" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface BackendCall<T> {
  tauri: TauriCall;
  http: HttpCall;
  parse: (data: unknown) => T;
}

export async function callBackend<T>(call: BackendCall<T>): Promise<T> {
  if (isTauri) {
    // Lazy-import so the @tauri-apps/api chunk only loads when actually
    // running inside Tauri.
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<unknown>(call.tauri.cmd, call.tauri.args);
    return call.parse(data);
  }
  return httpRequest(call.http, call.parse);
}

async function httpRequest<T>(http: HttpCall, parse: (data: unknown) => T): Promise<T> {
  const method = http.method ?? "GET";
  const qs = http.query ? "?" + new URLSearchParams(http.query).toString() : "";
  const init: RequestInit = { method };
  if (http.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(http.body);
  }
  const r = await fetch(`${apiBase()}${http.path}${qs}`, init);
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => ({}));
    const detail =
      typeof body === "object" && body !== null && "error" in body ? body.error : body;
    throw new Error(
      `${method} ${http.path} failed: HTTP ${r.status} — ${JSON.stringify(detail)}`,
    );
  }
  return parse(await r.json());
}
