import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from "vue";
import L, {
  type Map as LeafletMap,
  type LatLngExpression,
  type CRS,
  type CircleMarker,
} from "leaflet";
import { mapInfo, mapSvgPath, FACTION_COLORS, type TarkovMapCode } from "@shared/maps";
import type { Extract, Position3D } from "@shared/tarkov-api";

interface LoadedMap {
  width: number;
  height: number;
  floors: Map<string, SVGGElement>;
}

interface MarkerEntry {
  marker: CircleMarker;
  extract: Extract;
  /** Tooltip offset in screen pixels relative to the marker centre. */
  tooltipOffset: [number, number];
}

export type LabelMode = "hover" | "smart";

interface UseLeafletMapResult {
  map: ShallowRef<LeafletMap | null>;
  loaded: ShallowRef<LoadedMap | null>;
  mapError: Ref<string | null>;
  addExtractMarkers: (extracts: readonly Extract[]) => void;
  setExtractFilter: (visibleFactions: ReadonlyArray<string>, masterVisible: boolean) => void;
  setLabelMode: (mode: LabelMode) => void;
  setPlayerPosition: (pos: Position3D) => void;
  clearPlayerPosition: () => void;
}

const FALLBACK_COLOR = "#94a3b8";
/** Smart labels appear once the user zooms in by this many steps past the fit-bounds zoom. */
const SMART_LABEL_ZOOM_DELTA = 1;
/** Extracts within this many in-game units of each other share a tooltip ring. */
const COLOCATION_TOLERANCE = 2;
/** Radial distance from marker centre to the centre of its tooltip, in screen pixels. */
const TOOLTIP_RING_RADIUS = 22;
/** How much of the map bounds the user is allowed to pan past (0.15 = 15%). */
const PAN_PAD = 0.15;

function factionColor(faction: Extract["faction"]): string {
  const key = faction ?? "shared";
  return FACTION_COLORS[key as keyof typeof FACTION_COLORS] ?? FALLBACK_COLOR;
}

function factionForFilter(faction: Extract["faction"]): string {
  return faction ?? "shared";
}

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
  return [z, x];
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
  const bounds = mapLatLngBounds(info.bounds);

  let extractsLayer: L.LayerGroup | null = null;
  const entries: MarkerEntry[] = [];
  let initialZoom = 0;

  let playerLayer: L.LayerGroup | null = null;
  let playerCore: CircleMarker | null = null;
  let playerPulse: CircleMarker | null = null;

  // Internal state, mutated by setters; addExtractMarkers re-applies when (re)creating markers.
  const state = {
    visibleFactions: new Set<string>(["pmc", "scav", "shared"]),
    masterVisible: true,
    labelMode: "hover" as LabelMode,
  };

  function isEntryVisible(entry: MarkerEntry): boolean {
    return state.masterVisible && state.visibleFactions.has(factionForFilter(entry.extract.faction));
  }

  function buildTooltipOpts(): Omit<L.TooltipOptions, "offset"> {
    return {
      direction: "center",
      opacity: 0.95,
      permanent: state.labelMode === "smart",
      sticky: state.labelMode === "hover",
      className: "extract-tooltip",
    };
  }

  function applyTooltipBindings(): void {
    const base = buildTooltipOpts();
    for (const entry of entries) {
      entry.marker.unbindTooltip();
      entry.marker.bindTooltip(entry.extract.name, {
        ...base,
        offset: entry.tooltipOffset,
      });
    }
  }

  function refreshSmartLabels(): void {
    if (!map.value) return;
    if (state.labelMode !== "smart") return;

    const mapBounds = map.value.getBounds();
    const showAtZoom = map.value.getZoom() >= initialZoom + SMART_LABEL_ZOOM_DELTA;

    for (const entry of entries) {
      if (!isEntryVisible(entry)) {
        entry.marker.closeTooltip();
        continue;
      }
      const inView = mapBounds.contains(entry.marker.getLatLng());
      if (showAtZoom && inView) {
        entry.marker.openTooltip();
      } else {
        entry.marker.closeTooltip();
      }
    }
  }

  function applyVisibility(): void {
    if (!map.value || !extractsLayer) return;
    for (const entry of entries) {
      const visible = isEntryVisible(entry);
      const onLayer = extractsLayer.hasLayer(entry.marker);
      if (visible && !onLayer) {
        extractsLayer.addLayer(entry.marker);
      } else if (!visible && onLayer) {
        extractsLayer.removeLayer(entry.marker);
      }
    }
    refreshSmartLabels();
  }

  function addExtractMarkers(extracts: readonly Extract[]): void {
    if (!map.value) return;
    if (extractsLayer) {
      extractsLayer.clearLayers();
    } else {
      extractsLayer = L.layerGroup().addTo(map.value);
    }
    entries.length = 0;
    for (const ex of extracts) {
      const marker = L.circleMarker(inGameLatLng(ex.position.x, ex.position.z), {
        radius: 6,
        color: "#000",
        weight: 1.5,
        fillColor: factionColor(ex.faction),
        fillOpacity: 0.9,
      });
      entries.push({ marker, extract: ex, tooltipOffset: [0, -TOOLTIP_RING_RADIUS] });
    }
    computeTooltipOffsets();
    applyTooltipBindings();
    applyVisibility();
  }

  function computeTooltipOffsets(): void {
    // Markers stay at their true (x, z); only their tooltips get a radial offset
    // so labels do not stack on top of each other when extracts share a spot
    // (e.g. RUAF Roadblock has both a PMC and a Scav variant a metre apart).
    const bucketSize = Math.max(COLOCATION_TOLERANCE, 1);
    const groups = new Map<string, MarkerEntry[]>();
    for (const entry of entries) {
      const bx = Math.round(entry.extract.position.x / bucketSize);
      const bz = Math.round(entry.extract.position.z / bucketSize);
      const key = `${bx},${bz}`;
      const group = groups.get(key);
      if (group) {
        group.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    for (const group of groups.values()) {
      const total = group.length;
      const step = (2 * Math.PI) / total;
      for (let i = 0; i < total; i++) {
        const angle = i * step - Math.PI / 2;
        group[i]!.tooltipOffset = [
          Math.cos(angle) * TOOLTIP_RING_RADIUS,
          Math.sin(angle) * TOOLTIP_RING_RADIUS,
        ];
      }
    }
  }

  function setExtractFilter(
    visibleFactions: ReadonlyArray<string>,
    masterVisible: boolean,
  ): void {
    state.visibleFactions = new Set(visibleFactions);
    state.masterVisible = masterVisible;
    applyVisibility();
  }

  function setLabelMode(mode: LabelMode): void {
    if (state.labelMode === mode) return;
    state.labelMode = mode;
    applyTooltipBindings();
    if (mode === "smart") {
      refreshSmartLabels();
    } else {
      for (const entry of entries) {
        entry.marker.closeTooltip();
      }
    }
  }

  function setPlayerPosition(pos: Position3D): void {
    if (!map.value) return;
    const latLng = inGameLatLng(pos.x, pos.z);
    if (!playerLayer) {
      playerLayer = L.layerGroup().addTo(map.value);
    }
    if (!playerCore) {
      playerPulse = L.circleMarker(latLng, {
        radius: 14,
        color: "#f43f5e",
        weight: 2,
        opacity: 0.9,
        fill: false,
        className: "player-pulse",
        interactive: false,
      }).addTo(playerLayer);
      playerCore = L.circleMarker(latLng, {
        radius: 6,
        color: "#fff",
        weight: 2,
        fillColor: "#f43f5e",
        fillOpacity: 1,
        interactive: false,
      }).addTo(playerLayer);
    } else {
      playerCore.setLatLng(latLng);
      playerPulse?.setLatLng(latLng);
    }
  }

  function clearPlayerPosition(): void {
    if (playerLayer && map.value) {
      map.value.removeLayer(playerLayer);
    }
    playerLayer = null;
    playerCore = null;
    playerPulse = null;
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
      maxBoundsViscosity: 1.0,
    });
    map.value = instance;
    instance.fitBounds(bounds);
    initialZoom = instance.getZoom();
    instance.setMinZoom(initialZoom);
    instance.setMaxBounds(bounds.pad(PAN_PAD));

    instance.on("moveend zoomend", refreshSmartLabels);

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
    entries.length = 0;
    playerLayer = null;
    playerCore = null;
    playerPulse = null;
    map.value?.remove();
    map.value = null;
  });

  return {
    map,
    loaded,
    mapError,
    addExtractMarkers,
    setExtractFilter,
    setLabelMode,
    setPlayerPosition,
    clearPlayerPosition,
  };
}
