import { watch, type ShallowRef } from "vue";
import L, { type Marker, type LayerGroup, type Map as LeafletMap } from "leaflet";
import type { Extract } from "@shared/tarkov-api";

export type LabelMode = "hover" | "always";
export type LabelSize = "sm" | "md" | "lg";

export interface UseExtractMarkers {
  addExtractMarkers: (extracts: readonly Extract[]) => void;
  setExtractFilter: (visibleFactions: ReadonlyArray<string>) => void;
  setLabelMode: (mode: LabelMode) => void;
  setLabelSize: (size: LabelSize) => void;
}

interface MarkerEntry {
  marker: Marker;
  extract: Extract;
  /** Tooltip offset in screen pixels relative to the marker centre. */
  tooltipOffset: [number, number];
}

const LABEL_SIZE_PX: Readonly<Record<LabelSize, string>> = {
  sm: "9px",
  md: "11px",
  lg: "14px",
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

function factionForFilter(faction: Extract["faction"]): string {
  return faction ?? "shared";
}

/**
 * Owns the extracts layer: markers, tooltips, faction filter, and label
 * mode/size. Hooks the map's "click" event to re-open permanent tooltips
 * (Leaflet closes them on any stray click in `always` mode).
 */
export function useExtractMarkers(map: ShallowRef<LeafletMap | null>): UseExtractMarkers {
  let extractsLayer: LayerGroup | null = null;
  const entries: MarkerEntry[] = [];
  const state = {
    visibleFactions: new Set<string>(["pmc", "scav", "shared"]),
    labelMode: "hover" as LabelMode,
  };

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

  function addExtractMarkers(extracts: readonly Extract[]): void {
    if (!map.value) return;
    if (extractsLayer) {
      extractsLayer.clearLayers();
    } else {
      extractsLayer = L.layerGroup().addTo(map.value);
    }
    entries.length = 0;
    for (const ex of extracts) {
      const marker = L.marker([ex.position.z, ex.position.x], {
        icon: extractIcon(ex.faction),
        pane: "extracts",
      });
      entries.push({ marker, extract: ex, tooltipOffset: [0, -TOOLTIP_RING_RADIUS] });
    }
    computeTooltipOffsets();
    applyTooltipBindings();
    applyVisibility();
  }

  function setExtractFilter(visibleFactions: ReadonlyArray<string>): void {
    state.visibleFactions = new Set(visibleFactions);
    applyVisibility();
  }

  function setLabelSize(size: LabelSize): void {
    document.documentElement.style.setProperty("--extract-label-size", LABEL_SIZE_PX[size]);
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

  // Bind/unbind the click-anywhere handler when the map becomes available
  // (or gets destroyed). The handler re-opens permanent tooltips that a
  // stray click would otherwise close.
  watch(
    map,
    (m, prev) => {
      if (prev) prev.off("click", reopenAllPermanentTooltips);
      if (m) m.on("click", reopenAllPermanentTooltips);
    },
    { immediate: true },
  );

  return { addExtractMarkers, setExtractFilter, setLabelMode, setLabelSize };
}
