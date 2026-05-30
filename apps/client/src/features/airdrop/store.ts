import { z } from 'zod';
import { triangulateDropPoint, type TriangulationOutcome } from '@shared/triangulate';
import { persistedRef } from '@/shared/persisted-store';

export type AirdropPhase = 'idle' | 'armedFirst' | 'armedSecond' | 'result' | 'confirmingClear';

export interface AirdropSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawDeg: number;
}

/** Window for the second hotkey press that confirms a clear. Exported so
 * the banner UI can show the actual countdown rather than a magic string. */
export const CONFIRM_CLEAR_TIMEOUT_MS = 3000;

/** How long a triangulation-failure banner sticks around before the store
 * auto-resets to idle. Successful results stay until the user explicitly
 * clears them, but failures are just error messages — there's nothing to
 * preserve, and forcing a hotkey press to dismiss them is annoying when the
 * player just wants to re-arm and retry. */
const FAILURE_AUTO_DISMISS_MS = 5000;

/** Visual uncertainty circle around the predicted drop point. Static value
 * (in-game meters) — the underlying triangulation isn't precise enough at
 * typical 5m baselines to justify a computed radius, and an honest "drop is
 * somewhere within this area" reads better than a false-precision pin. */
const DROP_MARKER_RADIUS_DEFAULT = 20;
const DROP_MARKER_RADIUS_MIN = 5;
const DROP_MARKER_RADIUS_MAX = 100;
const dropMarkerRadiusSchema = z.number().min(DROP_MARKER_RADIUS_MIN).max(DROP_MARKER_RADIUS_MAX);

export const DROP_MARKER_RADIUS_RANGE = {
  min: DROP_MARKER_RADIUS_MIN,
  max: DROP_MARKER_RADIUS_MAX,
  default: DROP_MARKER_RADIUS_DEFAULT,
} as const;

/**
 * Two-shot airdrop triangulation state machine. Two trigger types feed the
 * machine, intentionally split because Tarkov reserves the screenshot key
 * (PrintScreen by default) at the DirectInput level and our Tauri global
 * shortcut couldn't reliably claim a bare key alongside it:
 *
 *   - **Hotkey** (configurable, default `Ctrl+Alt+D`): advances at state
 *     boundaries — `idle → armedFirst`, `result → confirmingClear`,
 *     `confirmingClear → idle`. Press during `armedFirst`/`armedSecond`
 *     is a no-op so an accidental hotkey can't short-circuit the flow.
 *
 *   - **`position` event** (fires when the screenshot-watcher parses a
 *     newly-saved position-encoded screenshot, ~250ms after the player
 *     presses PrintScreen in-game): captures sample A in `armedFirst`,
 *     sample B in `armedSecond` (running the triangulation), ignored
 *     elsewhere.
 *
 *     idle ──hotkey──> armedFirst ──position──> armedSecond ──position──> result
 *                                                                           │
 *                                                                         hotkey
 *                                                                           ▼
 *                                                                   confirmingClear
 *                                                                   │             │
 *                                                                hotkey       3s timeout
 *                                                                   ▼             ▼
 *                                                                 idle          result
 *
 * The 3-second confirmation window guards against an accidental hotkey
 * wiping a result the player is still using to navigate. UI surface: a
 * small banner that auto-hides on either branch out of `confirmingClear`.
 */
export const useAirdropStore = defineStore('airdrop', () => {
  const phase = ref<AirdropPhase>('idle');
  const sampleA = ref<AirdropSnapshot | null>(null);
  const sampleB = ref<AirdropSnapshot | null>(null);
  const outcome = ref<TriangulationOutcome | null>(null);
  // Player's most recent (x, z) — refreshed on every position event
  // regardless of phase. Drives the live distance-to-drop readout: after
  // triangulation the player keeps walking + taking PrintScreens, and the
  // banner ticks down the remaining distance as they approach.
  const playerCurrentPos = ref<{ readonly x: number; readonly z: number } | null>(null);
  const dropMarkerRadius = persistedRef(
    'tc.airdrop.dropMarkerRadius',
    dropMarkerRadiusSchema,
    DROP_MARKER_RADIUS_DEFAULT,
  );
  // Live countdown for the confirm-clear window — exposed reactively so the
  // banner can render `3.000 → 0.000` with millisecond precision. Driven by
  // requestAnimationFrame for display-refresh-aligned updates.
  const confirmRemainingMs = ref(0);
  let confirmRafId: number | null = null;
  let confirmDeadlineMs: number | null = null;
  let failureTimer: ReturnType<typeof setTimeout> | null = null;

  function stopConfirmCountdown(): void {
    if (confirmRafId !== null) {
      cancelAnimationFrame(confirmRafId);
      confirmRafId = null;
    }
    confirmDeadlineMs = null;
    confirmRemainingMs.value = 0;
  }

  function cancelFailureTimer(): void {
    if (failureTimer !== null) {
      clearTimeout(failureTimer);
      failureTimer = null;
    }
  }

  function startConfirmCountdown(): void {
    stopConfirmCountdown();
    confirmDeadlineMs = performance.now() + CONFIRM_CLEAR_TIMEOUT_MS;
    confirmRemainingMs.value = CONFIRM_CLEAR_TIMEOUT_MS;
    const tick = (): void => {
      if (confirmDeadlineMs === null) return;
      const remaining = confirmDeadlineMs - performance.now();
      if (remaining <= 0) {
        // Timeout expired — revert if we're still in confirmingClear (a
        // user-driven transition could have moved us out mid-frame).
        stopConfirmCountdown();
        if (phase.value === 'confirmingClear') phase.value = 'result';
        return;
      }
      confirmRemainingMs.value = remaining;
      confirmRafId = requestAnimationFrame(tick);
    };
    confirmRafId = requestAnimationFrame(tick);
  }

  function reset(): void {
    stopConfirmCountdown();
    cancelFailureTimer();
    phase.value = 'idle';
    sampleA.value = null;
    sampleB.value = null;
    outcome.value = null;
    // playerCurrentPos intentionally not cleared — the player hasn't moved,
    // and keeping it lets a fresh tracking flow immediately compute a sane
    // initial distance once it lands in `result`.
  }

  // Auto-dismiss failure banners after FAILURE_AUTO_DISMISS_MS — the player
  // can re-arm immediately without having to press the clear-hotkey twice
  // just to acknowledge "yeah, I know my angle was bad". Watch reacts to
  // phase changes too: leaving `result` (e.g. into `confirmingClear`) clears
  // the timer; coming back into `result` with a still-failed outcome (after
  // the confirm-clear timeout snaps back) restarts it.
  watch(
    [phase, outcome],
    () => {
      cancelFailureTimer();
      if (phase.value === 'result' && outcome.value && !outcome.value.ok) {
        failureTimer = setTimeout(() => {
          if (phase.value === 'result' && outcome.value && !outcome.value.ok) {
            reset();
          }
          failureTimer = null;
        }, FAILURE_AUTO_DISMISS_MS);
      }
    },
    { flush: 'post' },
  );

  function press(): void {
    switch (phase.value) {
      case 'idle':
        // Fresh arming — caller's next `position` event will fill sample A.
        sampleA.value = null;
        sampleB.value = null;
        outcome.value = null;
        phase.value = 'armedFirst';
        return;

      case 'armedFirst':
      case 'armedSecond':
        // Hotkey press while waiting for samples is a deliberate no-op —
        // the `position` event from the player's next PrintScreen is what
        // advances the machine, so an extra hotkey tap can't short-circuit
        // out of the flow before samples land.
        return;

      case 'result':
        // Failure result is just an error message — hotkey dismisses it
        // immediately, no confirmation step. The 5s auto-dismiss is the
        // safety net for users who don't notice the banner.
        if (outcome.value && !outcome.value.ok) {
          reset();
          return;
        }
        // Success result — arm the confirm safety: a second hotkey press
        // within the timeout actually clears. The rAF-driven countdown
        // updates the banner's displayed value in real time and auto-
        // reverts on expiry.
        phase.value = 'confirmingClear';
        startConfirmCountdown();
        return;

      case 'confirmingClear':
        // Confirmed: drop the result, return to idle. Player can immediately
        // start a fresh tracking flow with the next hotkey press.
        reset();
        return;
    }
  }

  function capturePosition(snap: AirdropSnapshot): void {
    // Update "where the player is right now" on every event regardless of
    // phase — this is what powers the live distance-to-drop readout while
    // the player walks toward a freshly-triangulated landing point.
    playerCurrentPos.value = { x: snap.x, z: snap.z };

    if (phase.value === 'armedFirst') {
      sampleA.value = snap;
      phase.value = 'armedSecond';
      return;
    }
    if (phase.value === 'armedSecond' && sampleA.value) {
      sampleB.value = snap;
      outcome.value = triangulateDropPoint(
        { x: sampleA.value.x, z: sampleA.value.z, yawDeg: sampleA.value.yawDeg },
        { x: snap.x, z: snap.z, yawDeg: snap.yawDeg },
      );
      phase.value = 'result';
    }
    // result / confirmingClear / idle: state machine ignores, but
    // playerCurrentPos above still flows through so distance updates live.
  }

  /**
   * Live distance from the player's most recent screenshot position to the
   * predicted touchdown point. Null when there's nothing to compute (no
   * result yet, or no position event received in this session).
   */
  const distanceToDrop = computed<number | null>(() => {
    if (!outcome.value?.ok || !playerCurrentPos.value) return null;
    const dx = outcome.value.result.x - playerCurrentPos.value.x;
    const dz = outcome.value.result.z - playerCurrentPos.value.z;
    return Math.sqrt(dx * dx + dz * dz);
  });

  return {
    phase,
    sampleA,
    sampleB,
    outcome,
    playerCurrentPos,
    dropMarkerRadius,
    confirmRemainingMs,
    distanceToDrop,
    press,
    capturePosition,
    reset,
  };
});
