import {
  serverConfigResponseSchema,
  type ServerConfigResponse,
  type ServerConfigUpdate,
} from "@shared/config-api";

function apiBase(): string {
  // In dev Vite is on 5173 and the Fastify server on 3000; in prod Fastify
  // serves the bundle at /, so a same-origin path works. We just always go
  // to <hostname>:3000 right now since the bundle isn't served yet.
  return `http://${window.location.hostname}:3000`;
}

export async function fetchServerConfig(): Promise<ServerConfigResponse> {
  const r = await fetch(`${apiBase()}/api/config`);
  if (!r.ok) throw new Error(`GET /api/config failed: HTTP ${r.status}`);
  return serverConfigResponseSchema.parse(await r.json());
}

export async function putServerConfig(
  patch: ServerConfigUpdate,
): Promise<ServerConfigResponse> {
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
