/**
 * Where the browser/PWA client expects the LAN Node backend to live.
 *
 * Both HTTP and WebSocket URLs are derived from the same port — they always
 * point at the same Fastify process, so a single env override is enough.
 * Tauri builds don't actually hit either URL (the in-process Rust port owns
 * IPC + position events), but the helpers stay safe to call regardless.
 */

const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || '3000';

export function apiBase(): string {
  return `http://${window.location.hostname}:${SERVER_PORT}`;
}

export function wsUrl(): string {
  return `ws://${window.location.hostname}:${SERVER_PORT}/ws`;
}
