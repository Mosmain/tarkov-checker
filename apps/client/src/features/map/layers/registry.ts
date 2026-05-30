import { computed, shallowReactive, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { Map as LeafletMap } from 'leaflet';
import type { TarkovMapCode, TarkovMapInfo } from '@shared/maps';

export interface MapLayerContext {
  map: ShallowRef<LeafletMap | null>;
  mapCode: TarkovMapCode;
  mapInfo: TarkovMapInfo;
  initialZoom: Ref<number>;
}

export interface MapLayer {
  id: string;
  mount: (ctx: MapLayerContext) => void;
}

const registry = shallowReactive(new Map<string, MapLayer>());

export function registerMapLayer(layer: MapLayer): void {
  registry.set(layer.id, layer);
}

/**
 * Read-once snapshot of registered layers. `MapView.vue` iterates this in
 * setup() and mounts each layer; layers added later (e.g. through dynamic
 * feature flags) won't appear without a `MapView` remount — which is what
 * `:key="mapCode"` already does on map switch. The ComputedRef wrapper is
 * kept for HMR: when a layer's index.ts is hot-reloaded, the reactive
 * registry mutation invalidates this computed so the next remount picks
 * up the new entry.
 */
export function useMapLayers(): ComputedRef<MapLayer[]> {
  return computed(() => [...registry.values()]);
}
