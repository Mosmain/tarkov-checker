/**
 * Imperative actions a map view exposes for keyboard/menu-driven control.
 * Lives in provide/inject rather than refs/defineExpose so that callers
 * higher in the tree (a sibling under <RouterView/>, a context menu) can
 * reach the active map without prop-drilling — and so the map can be swapped
 * (RaidView, ReplayView, ...) and still satisfy the same contract.
 */
export interface MapController {
  zoomIn: () => void;
  zoomOut: () => void;
  nextFloor: () => void;
  prevFloor: () => void;
}

export const MapControllerKey: InjectionKey<MapController> = Symbol("MapController");

const NOOP_CONTROLLER: MapController = {
  zoomIn: () => undefined,
  zoomOut: () => undefined,
  nextFloor: () => undefined,
  prevFloor: () => undefined,
};

/** Call from the MapView setup to expose its actions to descendants. */
export function provideMapController(controller: MapController): void {
  provide(MapControllerKey, controller);
}

/**
 * Read the active controller. When no map is mounted (route swap, app start
 * before MapView mounts) the no-op stub keeps hotkey handlers safe to call
 * unconditionally.
 */
export function useMapController(): MapController {
  return inject(MapControllerKey, NOOP_CONTROLLER);
}
