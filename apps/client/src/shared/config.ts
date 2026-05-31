/**
 * Backend endpoints. The local Rust helper (`apps/desktop/src-tauri`) is
 * the only HTTP target — Tauri webview bypasses HTTP entirely and goes
 * through IPC (see `transport.ts`/`useServerTransport.ts`), so these
 * helpers are only consulted when the page runs in a normal browser
 * tab.
 *
 * Three contexts to handle:
 *
 * 1. **Dev mode** (`pnpm dev` / `tauri:dev` → Vite on :5173): the
 *    SPA uses relative paths, Vite's `server.proxy` forwards `/api/*`
 *    and `/events` to `http://127.0.0.1:47474`. Single-origin → no
 *    CORS, no preflight.
 * 2. **Helper-served SPA** (LAN-phone scenario, or a browser opening
 *    `http://localhost:47474/` directly): the helper served the page
 *    AND hosts the API at the same origin. Relative paths work.
 *    Detected by checking `window.location.port === '47474'`.
 * 3. **Externally hosted SPA** (GitHub Pages, custom domain): the
 *    page is cross-origin to the helper. We point straight at
 *    `http://localhost:47474` — browsers allow this because
 *    `localhost` is a "potentially trustworthy origin" per the Secure
 *    Contexts spec; CORS is handled by the helper's `CorsLayer`
 *    (Origin allowlist + Private Network Access opt-in).
 *
 * The helper's listen port is fixed (`47474`, see
 * `apps/desktop/src-tauri/src/http_server.rs::LISTEN_PORT`).
 */

const HELPER_PORT = '47474';
const HELPER_BASE_URL = `http://localhost:${HELPER_PORT}`;

/**
 * True when the current page was served by the helper itself, so the
 * API is reachable at relative paths. Holds for the LAN-phone case
 * (`http://<lan-ip>:47474/`) AND the same-machine local-browser case
 * (`http://localhost:47474/`).
 *
 * Crucial on phones: a phone at `http://192.168.0.199:47474/` cannot
 * reach `http://localhost:47474/api/...` (its `localhost` is the
 * phone itself). Relative paths route back to the helper that served
 * the SPA in the first place — works regardless of which IP the
 * phone actually used.
 */
function isHelperServed(): boolean {
  return typeof window !== 'undefined' && window.location.port === HELPER_PORT;
}

export function apiBase(): string {
  if (!import.meta.env.PROD) return ''; // dev: Vite proxy
  if (isHelperServed()) return ''; // same-origin to the helper
  return HELPER_BASE_URL; // hosted page → cross-origin to localhost helper
}

export function eventsUrl(): string {
  return `${apiBase()}/events`;
}
