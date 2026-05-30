import L, { type Map as LeafletMap, type CRS } from 'leaflet';
import { mapInfo, mapSvgPath, type TarkovMapCode } from '@shared/maps';
import { useFloorSwitcher, type UseFloorSwitcher, type LoadedMap } from './useFloorSwitcher';

export type { LoadedMap };

interface UseLeafletMapResult extends UseFloorSwitcher {
  map: ShallowRef<LeafletMap | null>;
  loaded: ShallowRef<LoadedMap | null>;
  mapError: Ref<string | null>;
  initialZoom: Ref<number>;
  zoomIn: () => void;
  zoomOut: () => void;
  reload: () => void;
}

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

  const floor = useFloorSwitcher(loaded, info.floors, info.defaultFloor);
  let resizeObserver: ResizeObserver | null = null;
  let resizeWindowHandler: (() => void) | null = null;

  onMounted(async () => {
    if (!containerRef.value) return;

    const instance = L.map(containerRef.value, {
      crs,
      attributionControl: false,
      zoomControl: false,
      minZoom: -5,
      maxZoom: 4,
      zoomSnap: 0.25,
      maxBoundsViscosity: 1.0,
    });
    map.value = instance;
    const markersPane = instance.createPane('extracts');
    markersPane.style.zIndex = '500';
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

    function syncToContainer(): void {
      instance.invalidateSize({ animate: false, pan: false });
      applyFitZoom();
    }

    let initialBoxObserved = false;
    resizeObserver = new ResizeObserver(() => {
      if (!initialBoxObserved) {
        initialBoxObserved = true;
        return;
      }
      syncToContainer();
    });
    resizeObserver.observe(containerRef.value);

    resizeWindowHandler = syncToContainer;
    window.addEventListener('resize', resizeWindowHandler);

    await loadSvgIntoMap(instance);
  });

  async function loadSvgIntoMap(instance: LeafletMap): Promise<void> {
    try {
      mapError.value = null;
      // BASE_URL is `/` for local/Tauri builds and `/tarkov-checker/` on
      // GitHub Pages — runtime fetches need the prefix manually since
      // Vite only rewrites build-time asset references in HTML/CSS.
      const svgUrl = mapSvgPath(mapCode, `${import.meta.env.BASE_URL}maps`);
      const { svg, width, height, floors: floorGroups } = await fetchSvg(svgUrl);
      L.svgOverlay(svg, bounds, { interactive: false }).addTo(instance);
      loaded.value = { width, height, floors: floorGroups };
      if (info.defaultFloor && info.floors.length > 0) {
        floor.setActiveFloor(info.defaultFloor);
      }
    } catch (err) {
      mapError.value = err instanceof Error ? err.message : String(err);
    }
  }

  function reload(): void {
    if (map.value) void loadSvgIntoMap(map.value);
  }

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
    initialZoom,
    ...floor,
    zoomIn,
    zoomOut,
    reload,
  };
}
