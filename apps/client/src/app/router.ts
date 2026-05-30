import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router';
import { routes } from 'vue-router/auto-routes';
import { isTauri } from '@/shared/tauri';

/**
 * Route table is generated from src/pages/*.vue at build time by the
 * `vue-router/vite` plugin (see vite.config.ts) — adding a page is just
 * creating a file, no edits here. The typed-router.d.ts file alongside this
 * one (gitignored, regenerated on dev/build) is what gives `router.push`
 * compile-time autocompletion for route names.
 *
 * In Tauri the URL bar is invisible and route changes don't need to round-trip
 * through the browser history — memory history avoids stale entries when the
 * window is re-opened. The browser build keeps web history so deep links
 * (e.g. /raid on a phone) survive bookmarking.
 *
 * `import.meta.env.BASE_URL` (`/` for local builds, `/tarkov-checker/` for
 * the GitHub Pages project page — see `vite.config.ts`) prefixes every
 * route so deep links land under the right subpath.
 */
export const router = createRouter({
  history: isTauri ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
  routes,
});
