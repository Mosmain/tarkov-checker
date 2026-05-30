import { useServerEvent } from '@/features/server/composables/useServerEvents';
import { useAirdropStore } from '../store';

/**
 * Mounts the position-event listener that feeds the airdrop store. Every
 * position update flows through — `capturePosition` advances the state
 * machine only in armed phases, but it also refreshes `playerCurrentPos`
 * unconditionally so the live distance-to-drop readout keeps ticking down
 * as the player walks toward a triangulated landing point.
 *
 * Skip messages without yaw (legacy screenshots before quaternion-in-
 * filename) since triangulation has nothing to project without a sight
 * direction — the distance feature could survive without yaw, but the
 * arm-flow can't, so we filter once at the door.
 *
 * The hotkey itself is wired by the caller via `useGlobalShortcut` —
 * keeping the binding next to the other map hotkeys in `pages/index.vue`.
 */
export function useAirdropTracker(): void {
  const store = useAirdropStore();
  useServerEvent('position', (msg) => {
    if (msg.yaw === null || msg.yaw === undefined) return;
    store.capturePosition({ x: msg.x, y: msg.y, z: msg.z, yawDeg: msg.yaw });
  });
}
