import L, { type Map as LeafletMap, type CRS } from 'leaflet';
import { mapInfo, mapSvgPath, type TarkovMapCode } from '@shared/maps';
import {
  useExtractMarkers,
  type UseExtractMarkers,
  type LabelMode,
  type LabelSize,
} from '../layers/extracts/useExtractMarkers';
import { usePlayerMarker, type UsePlayerMarker, type PlayerFollow } from './usePlayerMarker';
import { useFloorSwitcher, type UseFloorSwitcher, type LoadedMap } from './useFloorSwitcher';

export type { LabelMode, LabelSize, PlayerFollow, LoadedMap };

interface UseLeafletMapResult extends UseExtractMarkers, UsePlayerMarker, UseFloorSwitcher {
  map: ShallowRef<LeafletMap | null>;
  loaded: ShallowRef<LoadedMap | null>;
  mapError: Ref<string | null>;
  zoomIn: () => void;
  zoomOut: () => void;
}

/** How much of the map bounds the user is allowed to pan past (0.15 = 15%). */
const PAN_PAD = 0.15;

function applyRotation(latLng: L.LatLng, rotationDeg: number): L.LatLng {
  if (rotationDeg === 0) return latLng;
  if (latLng.lat === 0 && latLng.lng === 0) return L.latLng(0, 0);
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const { lng: x, lat: y } = latLng;
  const rotatedX = x * cos - y * sin;
  const rotatedY = x * sin + y * cos;
  return L.latLng(rotatedY, rotatedX);
}

function buildCRS(transform: readonly [number, number, number, number], rotation: number): CRS {
  const [scaleX, marginX, scaleYRaw, marginY] = transform;
  const scaleY = scaleYRaw * -1;
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, marginX, scaleY, marginY),
    projection: L.extend({}, L.Projection.LonLat, {
      project(latLng: L.LatLng): L.Point {
        return L.Projection.LonLat.project(applyRotation(latLng, rotation));
      },
      unproject(point: L.Point): L.LatLng {
        return applyRotation(L.Projection.LonLat.unproject(point), -rotation);
      },
    }),
  }) as CRS;
}

function mapLatLngBounds(
  bounds: readonly [readonly [number, number], readonly [number, number]],
): L.LatLngBounds {
  const [[x1, z1], [x2, z2]] = bounds;
  return L.latLngBounds(L.latLng(z1, x1), L.latLng(z2, x2));
}

async function fetchSvg(url: string): Promise<{
  svg: SVGSVGElement;
  width: number;
  height: number;
  floors: Map<string, SVGGElement>;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`SVG parse error in ${url}: ${parseError.textContent ?? 'unknown'}`);
  }
  const svg = doc.documentElement as unknown as SVGSVGElement;
  const viewBoxAttr = svg.getAttribute('viewBox');
  if (!viewBoxAttr) {
    throw new Error(`SVG at ${url} has no viewBox attribute`);
  }
  const parts = viewBoxAttr
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`SVG at ${url} has malformed viewBox: ${viewBoxAttr}`);
  }
  const width = parts[2] as number;
  const height = parts[3] as number;

  const floors = new Map<string, SVGGElement>();
  for (const child of Array.from(svg.children)) {
    if (child.tagName.toLowerCase() === 'g' && child.id) {
      floors.set(child.id, child as SVGGElement);
    }
  }
  return { svg, width, height, floors };
}

/**
 * Initializes the Leaflet map with a custom CRS that bakes per-map rotation
 * into the projection, fetches the community SVG overlay, and orchestrates
 * the three feature composables (extract markers, player marker, floor
 * switcher). They share the `map` shallowRef so they can attach layers and
 * events without round-tripping through this orchestrator.
 */
export function useLeafletMap(
  containerRef: Ref<HTMLElement | null>,
  mapCode: TarkovMapCode,
): UseLeafletMapResult {
  const info = mapInfo(mapCode);
  const map = shallowRef<LeafletMap | null>(null);
  const loaded = shallowRef<LoadedMap | null>(null);
  const mapError = ref<string | null>(null);
  const initialZoom = ref(0);

  const crs = buildCRS(info.transform, info.rotation);
  const bounds = mapLatLngBounds(info.bounds);

  const extracts = useExtractMarkers(map);
  const player = usePlayerMarker(map, info.rotation, info.yawOffset ?? 0, initialZoom);
  const floor = useFloorSwitcher(loaded, info.floors, info.defaultFloor);
  let resizeObserver: ResizeObserver | null = null;
  let resizeWindowHandler: (() => void) | null = null;

  onMounted(async () => {
    if (!containerRef.value) return;

    const instance = L.map(containerRef.value, {
      crs,
      attributionControl: false,
      zoomControl: false,
      // applyFitZoom() ratchets minZoom up to the actual fit on every container
      // resize. The static value here is just the floor used temporarily
      // during recalculation — see MIN_ZOOM_FLOOR constant below.
      minZoom: -5,
      maxZoom: 4,
      zoomSnap: 0.25,
      maxBoundsViscosity: 1.0,
    });
    map.value = instance;
    // Custom pane for overlay markers — sits above the default overlayPane
    // (z 400) where L.svgOverlay lands, so markers stay visible after a map
    // switch even though the SVG is fetched asynchronously and lands later.
    const markersPane = instance.createPane('extracts');
    markersPane.style.zIndex = '500';
    // The zoom level at which the full map bounds fit in the current
    // container. Used as minZoom (so the user can't zoom past "whole map
    // visible") and as the base for player-follow zoom-in deltas. Recomputed
    // on container resize because a shrunk window needs a lower fit zoom —
    // otherwise minZoom stays at the initial larger value and zoom-out
    // hits an invisible floor.
    //
    // We also auto-refit the view when the user was AT fit zoom before the
    // resize — when they hadn't deliberately zoomed in, they expect the map
    // to keep tracking the container. A manually-zoomed user is left alone:
    // a window resize shouldn't yank them out of a detail they're inspecting.
    // Pre-fit zoom floor — matches the `minZoom` we pass to `L.map(..)` above.
    // We temporarily relax `minZoom` to this value before calling
    // `getBoundsZoom`, then ratchet it back up to the freshly-computed fit
    // zoom. Why: Leaflet's `getBoundsZoom` clamps its result to the current
    // `minZoom`, so a previous fit (e.g. 2.25 on a wide window) would
    // permanently lock zoom-out at that level — the very bug the user hit
    // when shrinking the window.
    const MIN_ZOOM_FLOOR = -5;

    function applyFitZoom(): void {
      instance.setMinZoom(MIN_ZOOM_FLOOR);
      const newFitZoom = instance.getBoundsZoom(bounds);
      const currentZoom = instance.getZoom();
      const wasAtFit = Math.abs(currentZoom - initialZoom.value) < 0.05;
      initialZoom.value = newFitZoom;
      instance.setMinZoom(newFitZoom);
      if (wasAtFit && currentZoom !== newFitZoom) {
        instance.setZoom(newFitZoom);
      }
    }
    instance.fitBounds(bounds);
    applyFitZoom();
    instance.setMaxBounds(bounds.pad(PAN_PAD));

    // Keep Leaflet's internal size cache in sync with the actual container.
    // Triggers on overlay window resize (Tauri), browser viewport resize, the
    // Settings drawer pushing the map sideways, and the WebView2 zoom factor
    // change (setZoom rescales the document, which the observer catches as a
    // content-rect change). Without this, the map renders at the initial size
    // and tiles/markers drift out of place.
    //
    // Two listeners, intentionally redundant: ResizeObserver catches CSS-
    // driven container changes (Settings drawer push, WebView zoom) but is
    // unreliable on shrink under WebView2 inside a transparent/frameless
    // Tauri window — it only fires when the observed element grows. The
    // window-level `resize` event is the dependable fallback for the
    // Tauri overlay-window case. Calls are idempotent (invalidateSize +
    // applyFitZoom converge on the same target).
    function syncToContainer(): void {
      instance.invalidateSize({ animate: false, pan: false });
      applyFitZoom();
    }

    let initialBoxObserved = false;
    resizeObserver = new ResizeObserver(() => {
      // Skip the synthetic event the browser fires right after observe() — it
      // arrives with the container's current dimensions and would just call
      // invalidateSize on a freshly-sized map.
      if (!initialBoxObserved) {
        initialBoxObserved = true;
        return;
      }
      syncToContainer();
    });
    resizeObserver.observe(containerRef.value);

    resizeWindowHandler = syncToContainer;
    window.addEventListener('resize', resizeWindowHandler);

    try {
      const svgUrl = mapSvgPath(mapCode);
      const { svg, width, height, floors: floorGroups } = await fetchSvg(svgUrl);
      L.svgOverlay(svg, bounds, { interactive: false }).addTo(instance);
      loaded.value = { width, height, floors: floorGroups };
      if (info.defaultFloor && info.floors.length > 0) {
        floor.setActiveFloor(info.defaultFloor);
      }
    } catch (err) {
      mapError.value = err instanceof Error ? err.message : String(err);
    }
  });

  function zoomIn(): void {
    map.value?.zoomIn();
  }

  function zoomOut(): void {
    map.value?.zoomOut();
  }

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (resizeWindowHandler) {
      window.removeEventListener('resize', resizeWindowHandler);
      resizeWindowHandler = null;
    }
    map.value?.remove();
    map.value = null;
  });

  return {
    map,
    loaded,
    mapError,
    ...extracts,
    ...player,
    ...floor,
    zoomIn,
    zoomOut,
  };
}
