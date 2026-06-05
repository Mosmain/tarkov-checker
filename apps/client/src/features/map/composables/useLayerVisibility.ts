import { z } from 'zod';
import type { Ref } from 'vue';
import { persistedRef } from '@/shared/persisted-store';

// One shared visibility ref per layer id (module-level singleton) so the
// on-map LayerRail toggle and the Leaflet layer composable read/write the SAME
// ref. Persisted, so a hidden layer stays hidden across sessions.
const refs = new Map<string, Ref<boolean>>();

export function useLayerVisibility(id: string): Ref<boolean> {
  let r = refs.get(id);
  if (!r) {
    r = persistedRef(`tc.layer.${id}.visible`, z.boolean(), true);
    refs.set(id, r);
  }
  return r;
}
