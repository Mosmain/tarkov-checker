import {
  serverConfigResponseSchema,
  type ServerConfigResponse,
  type ServerConfigUpdate,
} from "@shared/config-api";

const isTauri = "__TAURI_INTERNALS__" in window;

function apiBase(): string {
  return `http://${window.location.hostname}:3000`;
}

async function tauriInvoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  // Lazy-import so the chunk only loads when actually running inside Tauri.
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(name, args);
}

export async function fetchServerConfig(): Promise<ServerConfigResponse> {
  if (isTauri) {
    const data = await tauriInvoke<unknown>("get_config");
    return serverConfigResponseSchema.parse(data);
  }
  const r = await fetch(`${apiBase()}/api/config`);
  if (!r.ok) throw new Error(`GET /api/config failed: HTTP ${r.status}`);
  return serverConfigResponseSchema.parse(await r.json());
}

export async function putServerConfig(
  patch: ServerConfigUpdate,
): Promise<ServerConfigResponse> {
  if (isTauri) {
    const data = await tauriInvoke<unknown>("update_config", { patch });
    return serverConfigResponseSchema.parse(data);
  }
  const r = await fetch(`${apiBase()}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => ({}));
    const error =
      typeof body === "object" && body !== null && "error" in body ? body.error : body;
    throw new Error(`PUT /api/config failed: HTTP ${r.status} — ${JSON.stringify(error)}`);
  }
  return serverConfigResponseSchema.parse(await r.json());
}
