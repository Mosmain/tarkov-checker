import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from "vue";
import L, {
  type Map as LeafletMap,
  type LatLngExpression,
  type LatLngBoundsExpression,
  type CRS,
} from "leaflet";
import { mapInfo, mapSvgPath, type TarkovMapCode } from "@shared/maps";
import type { Extract, ExtractFaction } from "@shared/tarkov-api";

interface LoadedMap {
  width: number;
  height: number;
  floors: Map<string, SVGGElement>;
}

interface UseLeafletMapResult {
  map: ShallowRef<LeafletMap | null>;
  loaded: ShallowRef<LoadedMap | null>;
  mapError: Ref<string | null>;
  addExtractMarkers: (extracts: readonly Extract[]) => void;
}

const FACTION_COLOR: Record<ExtractFaction | "unknown", string> = {
  pmc: "#22c55e",
  scav: "#eab308",
  shared: "#3b82f6",
  unknown: "#94a3b8",
};

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

function inGameLatLng(x: number, z: number): LatLngExpression {
  // tarkov-dev convention: latLng = (z, x).
  return [z, x];
}

function mapBoundsLatLng(
  bounds: readonly [readonly [number, number], readonly [number, number]],
): LatLngBoundsExpression {
  // tarkov-dev stores bounds as [[x1, z1], [x2, z2]] (not min/max normalized).
  // L.latLngBounds itself normalizes once corners are in (lat, lng) order.
  const [[x1, z1], [x2, z2]] = bounds;
  return [
    [z1, x1],
    [z2, x2],
  ];
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
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`SVG parse error in ${url}: ${parseError.textContent ?? "unknown"}`);
  }
  const svg = doc.documentElement as unknown as SVGSVGElement;
  const viewBoxAttr = svg.getAttribute("viewBox");
  if (!viewBoxAttr) {
    throw new Error(`SVG at ${url} has no viewBox attribute`);
  }
  const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`SVG at ${url} has malformed viewBox: ${viewBoxAttr}`);
  }
  const width = parts[2] as number;
  const height = parts[3] as number;

  const floors = new Map<string, SVGGElement>();
  for (const child of Array.from(svg.children)) {
    if (child.tagName.toLowerCase() === "g" && child.id) {
      floors.set(child.id, child as SVGGElement);
    }
  }
  return { svg, width, height, floors };
}

export function useLeafletMap(
  containerRef: Ref<HTMLElement | null>,
  mapCode: TarkovMapCode,
): UseLeafletMapResult {
  const map = shallowRef<LeafletMap | null>(null);
  const loaded = shallowRef<LoadedMap | null>(null);
  const mapError = ref<string | null>(null);

  const info = mapInfo(mapCode);
  const crs = buildCRS(info.transform, info.rotation);
  const bounds = mapBoundsLatLng(info.bounds);

  // Layer group for extract markers; created on first add so we can clear
  // it without affecting the svg overlay.
  let extractsLayer: L.LayerGroup | null = null;

  function addExtractMarkers(extracts: readonly Extract[]): void {
    if (!map.value) return;
    if (extractsLayer) {
      extractsLayer.clearLayers();
    } else {
      extractsLayer = L.layerGroup().addTo(map.value);
    }
    for (const ex of extracts) {
      const color = FACTION_COLOR[ex.faction ?? "unknown"];
      L.circleMarker(inGameLatLng(ex.position.x, ex.position.z), {
        radius: 6,
        color: "#000",
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.9,
      })
        .bindTooltip(ex.name, { direction: "top", offset: [0, -6], opacity: 0.95 })
        .addTo(extractsLayer);
    }
  }

  onMounted(async () => {
    if (!containerRef.value) return;

    const instance = L.map(containerRef.value, {
      crs,
      attributionControl: false,
      zoomControl: true,
      minZoom: -5,
      maxZoom: 4,
      zoomSnap: 0.25,
    });
    map.value = instance;
    instance.fitBounds(bounds);

    try {
      const svgUrl = mapSvgPath(mapCode);
      const { svg, width, height, floors } = await fetchSvg(svgUrl);
      L.svgOverlay(svg, bounds, { interactive: false }).addTo(instance);
      loaded.value = { width, height, floors };
    } catch (err) {
      mapError.value = err instanceof Error ? err.message : String(err);
    }
  });

  onBeforeUnmount(() => {
    extractsLayer = null;
    map.value?.remove();
    map.value = null;
  });

  return { map, loaded, mapError, addExtractMarkers };
}
