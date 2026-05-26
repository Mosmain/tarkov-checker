import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from "vue";
import L, {
  type Map as LeafletMap,
  type LatLngExpression,
  type CRS,
  type Marker,
} from "leaflet";
import { mapInfo, mapSvgPath, type TarkovMapCode } from "@shared/maps";
import type { Extract, Position3D } from "@shared/tarkov-api";

interface LoadedMap {
  width: number;
  height: number;
  floors: Map<string, SVGGElement>;
}

interface MarkerEntry {
  marker: Marker;
  extract: Extract;
  /** Tooltip offset in screen pixels relative to the marker centre. */
  tooltipOffset: [number, number];
}

export type LabelMode = "hover" | "always";
export type LabelSize = "sm" | "md" | "lg";
export type PlayerFollow = "off" | "sm" | "md" | "lg";

interface UseLeafletMapResult {
  map: ShallowRef<LeafletMap | null>;
  loaded: ShallowRef<LoadedMap | null>;
  mapError: Ref<string | null>;
  currentFloor: Ref<string | null>;
  addExtractMarkers: (extracts: readonly Extract[]) => void;
  setExtractFilter: (visibleFactions: ReadonlyArray<string>) => void;
  setLabelMode: (mode: LabelMode) => void;
  setLabelSize: (size: LabelSize) => void;
  setPlayerFollow: (mode: PlayerFollow) => void;
  setActiveFloor: (id: string) => void;
  setPlayerPosition: (pos: Position3D, yaw?: number | null) => void;
  clearPlayerPosition: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  nextFloor: () => void;
  prevFloor: () => void;
}

const LABEL_SIZE_PX: Readonly<Record<LabelSize, string>> = {
  sm: "9px",
  md: "11px",
  lg: "14px",
};

/** Zoom levels (delta from initialZoom) for each follow mode; clamped to maxZoom. */
const FOLLOW_ZOOM_DELTA: Readonly<Record<Exclude<PlayerFollow, "off">, number>> = {
  sm: 1.5,
  md: 3,
  lg: 6,
};

const EXTRACT_ICON_SIZE = 26;
const EXTRACT_ICONS: Readonly<Record<"pmc" | "scav" | "shared", L.Icon>> = {
  pmc: L.icon({
    iconUrl: "/icons/extracts/extract_pmc.png",
    iconSize: [EXTRACT_ICON_SIZE, EXTRACT_ICON_SIZE],
    iconAnchor: [EXTRACT_ICON_SIZE / 2, EXTRACT_ICON_SIZE / 2],
    tooltipAnchor: [0, 0],
  }),
  scav: L.icon({
    iconUrl: "/icons/extracts/extract_scav.png",
    iconSize: [EXTRACT_ICON_SIZE, EXTRACT_ICON_SIZE],
    iconAnchor: [EXTRACT_ICON_SIZE / 2, EXTRACT_ICON_SIZE / 2],
    tooltipAnchor: [0, 0],
  }),
  shared: L.icon({
    iconUrl: "/icons/extracts/extract_shared.png",
    iconSize: [EXTRACT_ICON_SIZE, EXTRACT_ICON_SIZE],
    iconAnchor: [EXTRACT_ICON_SIZE / 2, EXTRACT_ICON_SIZE / 2],
    tooltipAnchor: [0, 0],
  }),
};

function extractIcon(faction: Extract["faction"]): L.Icon {
  const key = (faction ?? "shared") as keyof typeof EXTRACT_ICONS;
  return EXTRACT_ICONS[key] ?? EXTRACT_ICONS.shared;
}

/** Extracts within this many in-game units of each other share a tooltip ring. */
const COLOCATION_TOLERANCE = 2;
/** Radial distance from marker centre to the centre of its tooltip, in screen pixels. */
const TOOLTIP_RING_RADIUS = 28;
/** How much of the map bounds the user is allowed to pan past (0.15 = 15%). */
const PAN_PAD = 0.15;

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
  const currentFloor = ref<string | null>(null);

  const info = mapInfo(mapCode);
  const crs = buildCRS(info.transform, info.rotation);
  const bounds = mapLatLngBounds(info.bounds);

  let extractsLayer: L.LayerGroup | null = null;
  const entries: MarkerEntry[] = [];
  let initialZoom = 0;

  let playerLayer: L.LayerGroup | null = null;
  let playerCore: L.Marker | null = null;

  // Internal state, mutated by setters; addExtractMarkers re-applies when (re)creating markers.
  const state = {
    visibleFactions: new Set<string>(["pmc", "scav", "shared"]),
    labelMode: "hover" as LabelMode,
    playerFollow: "off" as PlayerFollow,
  };
  let lastFollowedX = Number.NaN;
  let lastFollowedZ = Number.NaN;
  let lastFollowedYaw: number | null = Number.NaN;

  function isEntryVisible(entry: MarkerEntry): boolean {
    return state.visibleFactions.has(factionForFilter(entry.extract.faction));
  }

  function buildTooltipOpts(): Omit<L.TooltipOptions, "offset" | "className"> {
    return {
      direction: "center",
      opacity: 0.95,
      permanent: state.labelMode === "always",
      sticky: state.labelMode === "hover",
    };
  }

  function applyTooltipBindings(): void {
    const base = buildTooltipOpts();
    for (const entry of entries) {
      entry.marker.unbindTooltip();
      const factionClass = factionForFilter(entry.extract.faction);
      entry.marker.bindTooltip(entry.extract.name, {
        ...base,
        offset: entry.tooltipOffset,
        className: `extract-tooltip extract-tooltip--${factionClass}`,
      });
      entry.marker.off("click", reopenAllPermanentTooltips);
      entry.marker.on("click", reopenAllPermanentTooltips);
    }
  }

  /**
   * In `always` mode a stray click — either on a marker or on the empty map —
   * closes the permanent tooltip Leaflet just rendered. Re-open every visible
   * marker's tooltip after each click so they stay parked.
   */
  function reopenAllPermanentTooltips(): void {
    if (state.labelMode !== "always") return;
    setTimeout(() => {
      for (const entry of entries) {
        if (isEntryVisible(entry)) entry.marker.openTooltip();
      }
    }, 0);
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
      const marker = L.marker(inGameLatLng(ex.position.x, ex.position.z), {
        icon: extractIcon(ex.faction),
        pane: "extracts",
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

  function setExtractFilter(visibleFactions: ReadonlyArray<string>): void {
    state.visibleFactions = new Set(visibleFactions);
    applyVisibility();
  }

  function setLabelSize(size: LabelSize): void {
    document.documentElement.style.setProperty("--extract-label-size", LABEL_SIZE_PX[size]);
  }

  function setPlayerFollow(mode: PlayerFollow): void {
    state.playerFollow = mode;
  }

  function setLabelMode(mode: LabelMode): void {
    if (state.labelMode === mode) return;
    state.labelMode = mode;
    applyTooltipBindings();
    if (mode === "hover") {
      for (const entry of entries) {
        entry.marker.closeTooltip();
      }
    }
  }

  function setPlayerPosition(pos: Position3D, yaw: number | null = null): void {
    if (!map.value) return;
    const latLng = inGameLatLng(pos.x, pos.z);
    if (!playerLayer) {
      playerLayer = L.layerGroup().addTo(map.value);
    }
    // The in-game yaw must be rotated by the map's own coordinateRotation
    // so the arrow points where the player is looking in the rendered view.
    const displayYaw = yaw === null ? null : yaw + info.rotation;
    const iconHtml = buildPlayerIconHtml(displayYaw);
    const icon = L.divIcon({
      html: iconHtml,
      className: "player-icon-wrapper",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    if (!playerCore) {
      playerCore = L.marker(latLng, {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
        pane: "extracts",
      }).addTo(playerLayer);
    } else {
      playerCore.setLatLng(latLng);
      playerCore.setIcon(icon);
    }

    const changed = pos.x !== lastFollowedX || pos.z !== lastFollowedZ || yaw !== lastFollowedYaw;
    if (changed && state.playerFollow !== "off") {
      const targetZoom = Math.min(
        initialZoom + FOLLOW_ZOOM_DELTA[state.playerFollow],
        map.value.getMaxZoom(),
      );
      map.value.setView(latLng, targetZoom, { animate: true, duration: 0.4 });
    }
    if (changed) {
      lastFollowedX = pos.x;
      lastFollowedZ = pos.z;
      lastFollowedYaw = yaw;
    }
  }

  function buildPlayerIconHtml(displayYaw: number | null): string {
    if (displayYaw === null) {
      return `<svg viewBox="-18 -18 36 36" xmlns="http://www.w3.org/2000/svg"><circle class="player-marker" cx="0" cy="0" r="7" /></svg>`;
    }
    return `<svg viewBox="-18 -18 36 36" xmlns="http://www.w3.org/2000/svg"><path class="player-marker" d="M 0,-13 L 9,9 L 0,4 L -9,9 Z" transform="rotate(${displayYaw})" /></svg>`;
  }

  function clearPlayerPosition(): void {
    if (playerLayer && map.value) {
      map.value.removeLayer(playerLayer);
    }
    playerLayer = null;
    playerCore = null;
  }

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
    // Custom pane for overlay markers — sits above the default overlayPane
    // (z 400) where L.svgOverlay lands, so markers stay visible after a map
    // switch even though the SVG is fetched asynchronously and lands later.
    const markersPane = instance.createPane("extracts");
    markersPane.style.zIndex = "500";
    instance.fitBounds(bounds);
    initialZoom = instance.getZoom();
    instance.setMinZoom(initialZoom);
    instance.setMaxBounds(bounds.pad(PAN_PAD));
    instance.on("click", reopenAllPermanentTooltips);

    try {
      const svgUrl = mapSvgPath(mapCode);
      const { svg, width, height, floors } = await fetchSvg(svgUrl);
      L.svgOverlay(svg, bounds, { interactive: false }).addTo(instance);
      loaded.value = { width, height, floors };
      if (info.defaultFloor && info.floors.length > 0) {
        setActiveFloor(info.defaultFloor);
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

  function shiftFloor(delta: 1 | -1): void {
    const floorIds = info.floors.map((f) => f.id);
    if (floorIds.length <= 1) return;
    const active = currentFloor.value ?? info.defaultFloor;
    // No usable anchor — neither a current nor default floor — bail.
    if (active === null) return;
    const idx = floorIds.indexOf(active);
    // Wrap around so repeated presses cycle the list.
    const nextIdx = (idx + delta + floorIds.length) % floorIds.length;
    const next = floorIds[nextIdx];
    if (next) setActiveFloor(next);
  }
  function nextFloor(): void {
    shiftFloor(1);
  }
  function prevFloor(): void {
    shiftFloor(-1);
  }

  function setActiveFloor(id: string): void {
    const floorIds = info.floors.map((f) => f.id);
    if (floorIds.length === 0) return;
    if (!floorIds.includes(id)) return;
    const map = loaded.value?.floors;
    if (!map) {
      // SVG hasn't loaded yet; remember choice and apply on load.
      currentFloor.value = id;
      return;
    }
    const ground = info.defaultFloor;
    for (const fid of floorIds) {
      const group = map.get(fid);
      if (!group) continue;
      if (fid === id) {
        group.style.display = "";
        group.style.opacity = "";
      } else if (fid === ground) {
        // Ground is the persistent context — always visible, dimmed when
        // another floor sits on top.
        group.style.display = "";
        group.style.opacity = "0.15";
      } else {
        group.style.display = "none";
        group.style.opacity = "";
      }
    }
    // SVG draws later siblings on top of earlier ones. Move the active
    // group to the end so it always renders above ground (and above other
    // floors that may sit between them in the original DOM order — e.g.
    // Labs Technical_Level is the first child, ground is the second).
    const activeGroup = map.get(id);
    if (activeGroup && activeGroup.parentNode) {
      activeGroup.parentNode.appendChild(activeGroup);
    }
    currentFloor.value = id;
  }

  onBeforeUnmount(() => {
    extractsLayer = null;
    entries.length = 0;
    playerLayer = null;
    playerCore = null;
    map.value?.remove();
    map.value = null;
  });

  return {
    map,
    loaded,
    mapError,
    currentFloor,
    addExtractMarkers,
    setExtractFilter,
    setLabelMode,
    setLabelSize,
    setPlayerFollow,
    setActiveFloor,
    setPlayerPosition,
    clearPlayerPosition,
    zoomIn,
    zoomOut,
    nextFloor,
    prevFloor,
  };
}
