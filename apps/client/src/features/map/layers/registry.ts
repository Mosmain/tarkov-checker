import {
  computed,
  shallowReactive,
  type Component,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue';
import type { Map as LeafletMap } from 'leaflet';
import type { TarkovMapCode, TarkovMapInfo } from '@shared/maps';

export interface MapLayerContext {
  map: ShallowRef<LeafletMap | null>;
  mapCode: TarkovMapCode;
  mapInfo: TarkovMapInfo;
  initialZoom: Ref<number>;
  /** Per-layer visibility, driven by the on-map LayerRail toggle. The layer's
   * composable watches this and adds/removes its Leaflet root accordingly. */
  visible: Ref<boolean>;
}

/** Rail category a layer is grouped under (a section of the on-map LayerRail). */
export type LayerCategory = 'player' | 'loot' | 'quests';

/** Context gate for a layer's rail row. Defaults to 'always'. The layer still
 * mounts on the map regardless — this only hides the toggle row. */
export type LayerAvailability = 'always' | 'tauri' | 'desktop-or-tauri';

export interface MapLayer {
  id: string;
  mount: (ctx: MapLayerContext) => void;
  /** Rail category this layer is grouped under. */
  category: LayerCategory;
  /** Ascending order within the category; use multiples of 10. */
  order: number;
  /** i18n key for the layer's display name (rail row + flyout header). */
  titleKey: string;
  /** Optional per-layer settings, rendered inline in the rail flyout via a gear. */
  settingsComponent?: Component;
  /** Optional quick controls (frequently-toggled filters), rendered always
   * expanded under the layer's row while the layer is visible — no gear click. */
  filterComponent?: Component;
  availability?: LayerAvailability;
}

// Single source of truth for a layer: what mounts on the map AND how the rail
// presents/toggles/configures it. No second registry, no cross-registry id
// matching — `useLayerVisibility(layer.id)` keys off these same ids.
const registry = shallowReactive(new Map<string, MapLayer>());

// HMR-safe: replace by id instead of duplicating on hot-reload.
export function registerMapLayer(layer: MapLayer): void {
  registry.set(layer.id, layer);
}

/**
 * Reactive snapshot of registered layers. `MapView.vue` mounts each in setup();
 * `LayerRail.vue` reads it to build the category icons + flyouts. shallowReactive
 * so late registrations (dev HMR) re-track the computed.
 */
export function useMapLayers(): ComputedRef<MapLayer[]> {
  return computed(() => [...registry.values()]);
}
