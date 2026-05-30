/**
 * Backend endpoints. Same-origin in both modes:
 *
 * - **Dev:** Vite (`:5173`) proxies `/api/*` and `/events` to Fastify
 *   (`:3000`) via `server.proxy` — the browser only ever talks to :5173.
 * - **Prod:** Fastify (`:3000`) serves the built SPA + the same routes,
 *   so the browser only ever talks to :3000.
 *
 * Both helpers return relative paths; whichever origin served the page
 * handles the request. Tauri builds short-circuit these calls (the
 * isTauri check in `transport.ts`/`useServerTransport.ts` routes through
 * IPC + Tauri events instead), so it's safe to call the helpers
 * unconditionally — they just never reach an HTTP path in Tauri.
 */

export function apiBase(): string {
  return '';
}

export function eventsUrl(): string {
  return '/events';
}
