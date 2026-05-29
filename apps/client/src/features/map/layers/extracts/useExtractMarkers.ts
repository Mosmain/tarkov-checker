import L, { type Marker, type LayerGroup, type Map as LeafletMap } from 'leaflet';
import { makeIcon } from './icon';
import { buildTooltipHtml, sortedEntries, type ExtractEntry } from './tooltip';

export type LabelMode = 'hover' | 'always';
export type LabelSize = 'sm' | 'md' | 'lg';

/**
 * One marker per logical (possibly composite) extract. `entries` is the
 * full faction-to-name list the dataset declares — multiple entries with
 * the same name mean the same exit serves several factions; multiple
 * entries with different names mean co-located but distinct exits we
 * chose to merge (e.g. dorms V-Ex + old road gate on Customs). The
 * composite icon and the visibility filter intersect this with the
 * active faction filter at render time.
 */
export interface ExtractMarker {
  readonly entries: ReadonlyArray<ExtractEntry>;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

export interface UseExtractMarkers {
  addExtractMarkers: (extracts: readonly ExtractMarker[]) => void;
  setExtractFilter: (visibleFactions: ReadonlyArray<string>) => void;
  setLabelMode: (mode: LabelMode) => void;
  setLabelSize: (size: LabelSize) => void;
}

interface MarkerEntry {
  marker: Marker;
  extract: ExtractMarker;
}

const LABEL_SIZE_PX: Readonly<Record<LabelSize, string>> = {
  sm: '9px',
  md: '11px',
  lg: '14px',
};

/**
 * Owns the extracts layer: markers, tooltips, faction filter, and label
 * mode/size. Icon and tooltip HTML are built by the sibling `./icon` and
 * `./tooltip` modules — this composable is just the Leaflet/Vue glue.
 * Hooks the map's "click" event to re-open permanent tooltips (Leaflet
 * closes them on any stray click in `always` mode).
 */
export function useExtractMarkers(map: ShallowRef<LeafletMap | null>): UseExtractMarkers {
  let extractsLayer: LayerGroup | null = null;
  const entries: MarkerEntry[] = [];
  const state = {
    visibleFactions: new Set<string>(['pmc', 'scav', 'shared']),
    labelMode: 'hover' as LabelMode,
  };

  /**
   * Filtered entries in canonical faction order. Empty result = hide the
   * marker entirely (no active faction owns any of its names).
   */
  function effectiveEntries(entry: MarkerEntry): Array<ExtractEntry> {
    return sortedEntries(entry.extract.entries).filter((e) =>
      state.visibleFactions.has(e.faction),
    );
  }

  function buildTooltipOpts(): Omit<L.TooltipOptions, 'offset' | 'className'> {
    return {
      direction: 'top',
      opacity: 0.95,
      permanent: state.labelMode === 'always',
      // `sticky: true` would let the tooltip follow the cursor inside the
      // marker — meaningless for fixed-position extract icons and breaks
      // the direction:'top' anchor.
      sticky: false,
    };
  }

  /**
   * Single function that reconciles every per-entry derived state with the
   * current filter + label mode: which icon to show, which tooltip rows,
   * and whether the marker stays on the layer at all.
   */
  function refreshMarkers(): void {
    if (!extractsLayer) return;
    const tooltipOpts = buildTooltipOpts();
    for (const entry of entries) {
      const filtered = effectiveEntries(entry);
      if (filtered.length > 0) {
        const factions = filtered.map((e) => e.faction);
        entry.marker.setIcon(makeIcon(factions));
        entry.marker.unbindTooltip();
        entry.marker.bindTooltip(buildTooltipHtml(filtered), {
          ...tooltipOpts,
          // Small extra gap above the icon's top edge (tooltipAnchor).
          offset: [0, -4],
          className: 'extract-tooltip',
        });
        entry.marker.off('click', reopenAllPermanentTooltips);
        entry.marker.on('click', reopenAllPermanentTooltips);
        if (!extractsLayer.hasLayer(entry.marker)) extractsLayer.addLayer(entry.marker);
      } else if (extractsLayer.hasLayer(entry.marker)) {
        entry.marker.unbindTooltip();
        extractsLayer.removeLayer(entry.marker);
      }
    }
  }

  /**
   * In `always` mode a stray click — either on a marker or on the empty map —
   * closes the permanent tooltip Leaflet just rendered. Re-open every visible
   * marker's tooltip after each click so they stay parked.
   */
  function reopenAllPermanentTooltips(): void {
    if (state.labelMode !== 'always') return;
    setTimeout(() => {
      for (const entry of entries) {
        if (effectiveEntries(entry).length > 0) entry.marker.openTooltip();
      }
    }, 0);
  }

  function addExtractMarkers(extracts: readonly ExtractMarker[]): void {
    if (!map.value) return;
    if (extractsLayer) {
      extractsLayer.clearLayers();
    } else {
      extractsLayer = L.layerGroup().addTo(map.value);
    }
    entries.length = 0;
    for (const ex of extracts) {
      // Placeholder icon — refreshMarkers replaces it with the correct
      // composite below based on the active filter.
      const placeholder = ex.entries[0]?.faction ?? 'shared';
      const marker = L.marker([ex.position.z, ex.position.x], {
        icon: makeIcon([placeholder]),
        pane: 'extracts',
      });
      entries.push({ marker, extract: ex });
    }
    refreshMarkers();
  }

  function setExtractFilter(visibleFactions: ReadonlyArray<string>): void {
    state.visibleFactions = new Set(visibleFactions);
    refreshMarkers();
  }

  function setLabelSize(size: LabelSize): void {
    document.documentElement.style.setProperty('--extract-label-size', LABEL_SIZE_PX[size]);
    // Leaflet computes tooltip position once at bindTooltip and caches the
    // measured DOM rect — it doesn't notice when the CSS variable change
    // resized our tooltip text. Rebind so direction:'top' re-anchors
    // against the new height; visually noticeable in `always` mode, where
    // tooltips are already on screen with stale offsets.
    refreshMarkers();
  }

  function setLabelMode(mode: LabelMode): void {
    if (state.labelMode === mode) return;
    state.labelMode = mode;
    refreshMarkers();
    if (mode === 'hover') {
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
      if (prev) prev.off('click', reopenAllPermanentTooltips);
      if (m) m.on('click', reopenAllPermanentTooltips);
    },
    { immediate: true },
  );

  return { addExtractMarkers, setExtractFilter, setLabelMode, setLabelSize };
}
