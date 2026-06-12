// Thin wrapper over VueUse useFullscreen. Targets documentElement so the
// browser address bar collapses (not just an element). Callers get independent
// instances that stay in sync via their own `fullscreenchange` listeners — no
// shared singleton, so an unmounting consumer can't strand the others.
export function useFullscreenToggle() {
  const target = typeof document !== 'undefined' ? document.documentElement : undefined;
  const { isFullscreen, isSupported, toggle } = useFullscreen(target);
  return { isFullscreen, isSupported, toggle };
}
