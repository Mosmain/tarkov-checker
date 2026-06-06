import type { ComputedRef, Ref } from 'vue';

// iOS (incl. iPadOS, which reports as Mac) — used ONLY to pick the "Add to Home
// Screen" hint when the Fullscreen API is absent. Real capability is gated on
// useFullscreen().isSupported, never on this UA sniff.
function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function detectNavigatorStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export interface DisplayEnv {
  isIos: boolean;
  /** Launched as an installed PWA (no browser chrome → fullscreen affordance moot). */
  isStandalone: ComputedRef<boolean>;
  isMobileViewport: Ref<boolean>;
  isTouch: Ref<boolean>;
}

export function useDisplayEnv(): DisplayEnv {
  const displayModeStandalone = useMediaQuery('(display-mode: standalone)');
  const navStandalone = detectNavigatorStandalone();
  return {
    isIos: detectIos(),
    isStandalone: computed(() => displayModeStandalone.value || navStandalone),
    isMobileViewport: useMediaQuery('(max-width: 639px)'),
    isTouch: useMediaQuery('(hover: none) and (pointer: coarse)'),
  };
}
