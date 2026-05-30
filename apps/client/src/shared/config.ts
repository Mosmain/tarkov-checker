/**
 * Backend endpoints. The local Rust helper (`apps/desktop/src-tauri`) is
 * the only HTTP target — Tauri webview bypasses HTTP entirely and goes
 * through IPC (see `transport.ts`/`useServerTransport.ts`), so these
 * helpers are only consulted when the page runs in a normal browser
 * tab.
 *
 * Dev mode (`pnpm dev` → `http://localhost:5173`): relative paths are
 * proxied to `http://localhost:47474` by `vite.config.ts`. Keeping the
 * URL same-origin avoids any preflight noise during local development.
 *
 * Production (built SPA hosted on GitHub Pages, custom domain, anywhere
 * served as static): the page is cross-origin to the helper. We must
 * point straight at `http://localhost:47474` — the page's relative URL
 * would otherwise hit the hosting domain (which has no API). Browsers
 * allow the cross-origin call because `localhost` is a "potentially
 * trustworthy origin" per the Secure Contexts spec; CORS is handled by
 * the helper's `CorsLayer` (Origin allowlist + Private Network Access).
 *
 * The constant is fixed because the helper's listen address is fixed
 * (`127.0.0.1:47474`, see `apps/desktop/src-tauri/src/http_server.rs`).
 */

const HELPER_BASE_URL = 'http://localhost:47474';

export function apiBase(): string {
  return import.meta.env.PROD ? HELPER_BASE_URL : '';
}

export function eventsUrl(): string {
  return import.meta.env.PROD ? `${HELPER_BASE_URL}/events` : '/events';
}
