import type { ComputedRef } from 'vue';

// iOS (incl. iPadOS, which reports as Mac). Used only to pick the "Add to Home
// Screen" hint when the Fullscreen API is absent — capability is otherwise gated
// on real feature detection, never on this UA sniff.
function isIosDevice(): boolean {
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
}

export function useDisplayEnv(): DisplayEnv {
  const displayModeStandalone = useMediaQuery('(display-mode: standalone)');
  const navStandalone = detectNavigatorStandalone();
  return {
    isIos: isIosDevice(),
    isStandalone: computed(() => displayModeStandalone.value || navStandalone),
  };
}
