import L from 'leaflet';
import type { FactionKey } from '@shared/maps';

export const EXTRACT_ICON_SIZE = 26;

/** Canonical render order — keeps composite slices stable across reorderings. */
export const FACTION_ORDER: ReadonlyArray<FactionKey> = ['pmc', 'scav', 'shared'];

// `BASE_URL` is `/` for local/Tauri builds and `/raidmate/` on
// GitHub Pages — runtime URLs in HTML strings need the prefix manually
// since Vite only rewrites build-time asset references in template/CSS.
// Same pattern as `mapSvgPath(...)` in useLeafletMap.ts.
const BASE = import.meta.env.BASE_URL;
const FACTION_ICON_URL: Readonly<Record<FactionKey, string>> = {
  pmc: `${BASE}icons/extracts/extract_pmc.png`,
  scav: `${BASE}icons/extracts/extract_scav.png`,
  shared: `${BASE}icons/extracts/extract_shared.png`,
};

/**
 * `/`-direction (top-right ↔ bottom-left) clip polygons in CSS percentage
 * coordinates. For two slices the cut goes through the centre; for three,
 * two parallel cuts carve the square into thirds equal in area (corner
 * triangle area = c²/2; setting c²/2 = total/3 → c ≈ 0.816). Linear
 * thirds (c = 33%) would give wildly unequal pieces — tiny triangle,
 * fat band, tiny triangle — so we use the area-balanced split instead.
 */
const SLICE_2: ReadonlyArray<string> = [
  'polygon(0% 0%, 100% 0%, 0% 100%)',
  'polygon(100% 0%, 100% 100%, 0% 100%)',
];
const SLICE_3: ReadonlyArray<string> = [
  'polygon(0% 0%, 81.6% 0%, 0% 81.6%)',
  'polygon(81.6% 0%, 100% 0%, 100% 18.4%, 18.4% 100%, 0% 100%, 0% 81.6%)',
  'polygon(100% 18.4%, 100% 100%, 18.4% 100%)',
];

/**
 * Builds the inner HTML of a divIcon. Single-faction is a plain <img>;
 * multi-faction stacks <img>s with CSS clip-path so the source PNGs are
 * never duplicated as assets and re-rendering on filter change is cheap.
 */
function buildIconHtml(activeFactions: ReadonlyArray<FactionKey>): string {
  if (activeFactions.length === 1) {
    return `<img src="${FACTION_ICON_URL[activeFactions[0]!]}" width="${EXTRACT_ICON_SIZE}" height="${EXTRACT_ICON_SIZE}" alt="" />`;
  }
  const slices = activeFactions.length === 2 ? SLICE_2 : SLICE_3;
  return activeFactions
    .map(
      (f, i) =>
        `<img class="extract-icon-slice" style="clip-path: ${slices[i]!};" src="${FACTION_ICON_URL[f]}" alt="" />`,
    )
    .join('');
}

/**
 * Build a Leaflet divIcon for the given set of active factions. One faction
 * renders a plain PNG; two or three render the composite via CSS clip-path
 * slices defined above. The `tooltipAnchor` deliberately sits a few pixels
 * inside the icon's top edge — with direction:'top' (set in the composable's
 * bindTooltip call), Leaflet places the tooltip's bottom edge at this point,
 * so the tooltip overlaps the icon's top sliver for a tighter visual link.
 * Multi-row tooltips grow upward from the same pin, so the overlap stays
 * constant regardless of row count.
 */
export function makeIcon(activeFactions: ReadonlyArray<FactionKey>): L.DivIcon {
  return L.divIcon({
    html: buildIconHtml(activeFactions),
    className: 'extract-icon-divicon',
    iconSize: [EXTRACT_ICON_SIZE, EXTRACT_ICON_SIZE],
    iconAnchor: [EXTRACT_ICON_SIZE / 2, EXTRACT_ICON_SIZE / 2],
    tooltipAnchor: [0, -EXTRACT_ICON_SIZE / 2 + 6],
  });
}
