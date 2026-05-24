import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from "vue";
import L, { type Map as LeafletMap, type LatLngBoundsLiteral } from "leaflet";

interface LoadedMap {
  width: number;
  height: number;
  floors: Map<string, SVGGElement>;
}

interface UseLeafletMapResult {
  map: ShallowRef<LeafletMap | null>;
  loaded: ShallowRef<LoadedMap | null>;
  error: Ref<string | null>;
}

async function loadSvgFromUrl(url: string): Promise<{
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
  svgUrl: string,
): UseLeafletMapResult {
  const map = shallowRef<LeafletMap | null>(null);
  const loaded = shallowRef<LoadedMap | null>(null);
  const error = ref<string | null>(null);

  onMounted(async () => {
    if (!containerRef.value) return;

    const instance = L.map(containerRef.value, {
      crs: L.CRS.Simple,
      attributionControl: false,
      zoomControl: true,
      minZoom: -5,
      maxZoom: 4,
      zoomSnap: 0.25,
    });
    map.value = instance;

    try {
      const { svg, width, height, floors } = await loadSvgFromUrl(svgUrl);
      const bounds: LatLngBoundsLiteral = [
        [0, 0],
        [height, width],
      ];
      L.svgOverlay(svg, bounds, { interactive: false }).addTo(instance);
      instance.fitBounds(bounds);
      instance.setMaxBounds(L.latLngBounds(bounds).pad(0.5));
      loaded.value = { width, height, floors };
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  });

  onBeforeUnmount(() => {
    map.value?.remove();
    map.value = null;
  });

  return { map, loaded, error };
}
