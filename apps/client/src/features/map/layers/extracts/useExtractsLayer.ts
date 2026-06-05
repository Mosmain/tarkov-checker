import L, { type Marker, type LayerGroup } from 'leaflet';
import { FACTION_COLORS } from '@shared/maps';
import { makeIcon } from './icon';
import { buildTooltipHtml, sortedEntries, type ExtractEntry } from './tooltip';
import { createEdgeIndicators, type EdgeArrow } from './useEdgeIndicators';
import { extractsForMap } from '@/features/map/data/extracts';
import { useMapSettingsStore } from '@/features/map/store';
import { useOverlayStore } from '@/features/overlay/store';
import type { MapLayerContext } from '../registry';

export type LabelMode = 'hover' | 'always';
export type LabelSize = 'sm' | 'md' | 'lg';

export interface ExtractMarker {
  readonly entries: ReadonlyArray<ExtractEntry>;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
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

const COLOCATION_TOLERANCE = 2;

interface RawExtract {
  key: string;
  factions: ReadonlyArray<'pmc' | 'scav' | 'shared'>;
  position: { x: number; y: number; z: number };
}

export function useExtractsLayer(ctx: MapLayerContext): void {
  const { map, mapCode, visible } = ctx;
  const { t, locale } = useI18n();
  const { extractFactions, extractLabelMode, extractLabelSize, edgeIndicators } =
    storeToRefs(useMapSettingsStore());
  const { clickThrough } = storeToRefs(useOverlayStore());

  let extractsLayer: LayerGroup | null = null;
  let edge: ReturnType<typeof createEdgeIndicators> | null = null;
  const entries: MarkerEntry[] = [];
  const state = {
    visibleFactions: new Set<string>(extractFactions.value),
    labelMode: extractLabelMode.value as LabelMode,
  };

  function effectiveEntries(entry: MarkerEntry): Array<ExtractEntry> {
    return sortedEntries(entry.extract.entries).filter((e) => state.visibleFactions.has(e.faction));
  }

  function buildTooltipOpts(): Omit<L.TooltipOptions, 'offset' | 'className'> {
    return {
      direction: 'top',
      opacity: 0.95,
      permanent: state.labelMode === 'always',
      sticky: false,
    };
  }

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
    edge?.update();
  }

  // Off-screen extract arrows (opt-in). One arrow per visible merged extract,
  // coloured by its first visible faction; the overlay itself decides which
  // are off-screen on each map move.
  function arrowData(): EdgeArrow[] {
    const out: EdgeArrow[] = [];
    for (const entry of entries) {
      const first = effectiveEntries(entry)[0];
      if (!first) continue;
      out.push({
        lat: entry.extract.position.z,
        lng: entry.extract.position.x,
        color: FACTION_COLORS[first.faction],
      });
    }
    return out;
  }

  function syncEdge(): void {
    if (edgeIndicators.value && visible.value && map.value) {
      if (edge) edge.update();
      else edge = createEdgeIndicators(map.value, arrowData);
    } else if (edge) {
      edge.destroy();
      edge = null;
    }
  }

  function reopenAllPermanentTooltips(): void {
    if (state.labelMode !== 'always') return;
    setTimeout(() => {
      for (const entry of entries) {
        if (effectiveEntries(entry).length > 0) entry.marker.openTooltip();
      }
    }, 0);
  }

  function nameOf(ex: RawExtract): string {
    const i18nKey = `extractNames.${mapCode}.${ex.key}`;
    const v = t(i18nKey);
    return v === i18nKey ? ex.key : v;
  }

  function applyVisible(): void {
    if (!map.value || !extractsLayer) return;
    const has = map.value.hasLayer(extractsLayer);
    if (visible.value && !has) extractsLayer.addTo(map.value);
    if (!visible.value && has) map.value.removeLayer(extractsLayer);
    syncEdge();
  }

  function loadExtracts(): void {
    const data = extractsForMap(mapCode);
    if (!data) {
      console.warn(`[extracts] No dataset for mapCode=${mapCode}`);
      return;
    }

    const buckets = new Map<string, RawExtract[]>();
    for (const ex of data) {
      const bx = Math.round(ex.position.x / COLOCATION_TOLERANCE);
      const bz = Math.round(ex.position.z / COLOCATION_TOLERANCE);
      const key = `${bx},${bz}`;
      const group = buckets.get(key);
      if (group) group.push(ex as RawExtract);
      else buckets.set(key, [ex as RawExtract]);
    }

    const markers: ExtractMarker[] = [];
    for (const group of buckets.values()) {
      const entryList: { faction: 'pmc' | 'scav' | 'shared'; name: string }[] = [];
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (const ex of group) {
        const name = nameOf(ex);
        for (const faction of ex.factions) entryList.push({ faction, name });
        sumX += ex.position.x;
        sumY += ex.position.y;
        sumZ += ex.position.z;
      }
      markers.push({
        entries: entryList,
        position: { x: sumX / group.length, y: sumY / group.length, z: sumZ / group.length },
      });
    }

    if (!map.value) return;
    if (extractsLayer) {
      extractsLayer.clearLayers();
    } else {
      extractsLayer = L.layerGroup().addTo(map.value);
    }
    entries.length = 0;
    for (const ex of markers) {
      const placeholder = ex.entries[0]?.faction ?? 'shared';
      const marker = L.marker([ex.position.z, ex.position.x], {
        icon: makeIcon([placeholder]),
        pane: 'extracts',
      });
      entries.push({ marker, extract: ex });
    }
    refreshMarkers();
    syncEdge();
    applyVisible();
  }

  // Single source of truth for "the map exists now": loads markers + attaches
  // the click handler when map becomes non-null, detaches the handler on
  // map removal. Defensive against future composable-order reorganizations
  // (matches the same pattern airdrop already uses).
  watch(
    map,
    (m, prev) => {
      if (prev) prev.off('click', reopenAllPermanentTooltips);
      if (m) {
        m.on('click', reopenAllPermanentTooltips);
        loadExtracts();
      } else if (edge) {
        edge.destroy();
        edge = null;
      }
    },
    { immediate: true },
  );

  watch(edgeIndicators, syncEdge);

  watch(locale, () => {
    loadExtracts();
  });

  watch(extractFactions, (factions) => {
    state.visibleFactions = new Set(factions);
    refreshMarkers();
  });

  watch(visible, applyVisible);

  // Locking the overlay slides the on-map rail out (CSS transition) with no map
  // event to recompute edge arrows — drive update() across the transition window
  // so the arrows re-flow around the (dis)appearing rail in sync.
  let railAnimRaf = 0;
  watch(clickThrough, () => {
    cancelAnimationFrame(railAnimRaf);
    const start = performance.now();
    const tick = (): void => {
      edge?.update();
      if (performance.now() - start < 260) railAnimRaf = requestAnimationFrame(tick);
    };
    railAnimRaf = requestAnimationFrame(tick);
  });

  watch(extractLabelMode, (mode) => {
    if (state.labelMode === mode) return;
    state.labelMode = mode;
    refreshMarkers();
    if (mode === 'hover') {
      for (const entry of entries) {
        entry.marker.closeTooltip();
      }
    } else {
      for (const entry of entries) {
        if (effectiveEntries(entry).length > 0) entry.marker.openTooltip();
      }
    }
  });

  watch(
    extractLabelSize,
    (size) => {
      document.documentElement.style.setProperty('--extract-label-size', LABEL_SIZE_PX[size]);
      refreshMarkers();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    cancelAnimationFrame(railAnimRaf);
    edge?.destroy();
    edge = null;
    if (extractsLayer && map.value) {
      map.value.removeLayer(extractsLayer);
    }
    extractsLayer = null;
    entries.length = 0;
  });
}
