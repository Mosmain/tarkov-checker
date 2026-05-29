import { canonicalMapCode, isKnownMapCode } from '@shared/maps';
import { useServerEvent } from '@/features/server/composables/useServerEvents';
import { useMapSettingsStore } from '../store';

/**
 * Wires `map-change` events from the Tarkov log watcher into the persisted
 * map setting. Mount once at the app root.
 *
 * Behaviour:
 *  - When `autoMapSwitch` is off, events are ignored entirely (user keeps
 *    manual control).
 *  - Unknown `rawMapId` (e.g. a brand-new map BSG ships before we update
 *    `TARKOV_MAPS`) is logged via `console.warn` and dropped — the overlay
 *    keeps showing the previous map rather than blanking out.
 *  - Aliases (`factory4_night` → `factory4_day`, `sandbox_high` → `sandbox`)
 *    are resolved via `canonicalMapCode()` so the persisted code stays
 *    canonical and the per-map extracts dataset resolves cleanly.
 */
export function useAutoMapSwitch(): void {
  const store = useMapSettingsStore();

  useServerEvent('map-change', (msg) => {
    if (!store.autoMapSwitch) return;
    if (!isKnownMapCode(msg.rawMapId)) {
      console.warn(
        `[auto-map-switch] ignoring unknown rawMapId "${msg.rawMapId}" — not present in TARKOV_MAPS`,
      );
      return;
    }
    const canonical = canonicalMapCode(msg.rawMapId);
    if (store.mapCode !== canonical) {
      store.mapCode = canonical as typeof store.mapCode;
    }
  });
}
