import { z } from 'zod';
import { effectScope, type Ref } from 'vue';
import { persistedRef } from '@/shared/persisted-store';

// One shared visibility ref per layer id (module-level singleton) so the on-map
// LayerRail toggle and the Leaflet layer composable read/write the SAME ref.
//
// Created inside a DETACHED effect scope so the localStorage watch that
// `persistedRef` installs lives for the whole process. Created naively, that
// watch is owned by whichever component first calls this (MapView's setup) and
// gets disposed on the next map switch (`:key="mapCode"` remount) — silently
// stopping persistence. This scope is never stopped.
const scope = effectScope(true);
const refs = new Map<string, Ref<boolean>>();

export function useLayerVisibility(id: string): Ref<boolean> {
  const cached = refs.get(id);
  if (cached) return cached;
  // scope.run only returns undefined if the scope is stopped; ours never is.
  const r = scope.run(() =>
    persistedRef(`rm.layer.${id}.visible`, z.boolean(), true),
  ) as Ref<boolean>;
  refs.set(id, r);
  return r;
}
