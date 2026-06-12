import { computed, type ComputedRef } from 'vue';
import { useOverlayStore } from '../store';

/**
 * Single source of truth for the overlay's click-through lock policy:
 * **controls hide, glanceable read-outs stay.** Every piece of chrome reads its
 * lock-derived state from here instead of re-deriving `!clickThrough` itself, so
 * the policy has ONE definition as more chrome is added.
 *
 * Read-only derived state + the `lock()` action (the lock button). Unlock is
 * hotkey-only by design — see `App.vue`'s global shortcut.
 */
export interface OverlayLock {
  /** Click-through is on; the overlay can't be clicked. */
  locked: ComputedRef<boolean>;
  /** Show interactive chrome (rail, top-band controls, border). Hidden on lock. */
  showControls: ComputedRef<boolean>;
  /** Engage the lock. */
  lock: () => void;
}

export function useOverlayLock(): OverlayLock {
  const { clickThrough } = storeToRefs(useOverlayStore());
  return {
    locked: computed(() => clickThrough.value),
    showControls: computed(() => !clickThrough.value),
    lock: () => {
      clickThrough.value = true;
    },
  };
}
