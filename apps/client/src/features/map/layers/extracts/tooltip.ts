import { FACTION_COLORS, type FactionKey } from '@shared/maps';
import { FACTION_ORDER } from './icon';

export interface ExtractEntry {
  readonly faction: FactionKey;
  readonly name: string;
}

/** Sort entries by canonical faction order so visuals are deterministic. */
export function sortedEntries(entries: ReadonlyArray<ExtractEntry>): Array<ExtractEntry> {
  return FACTION_ORDER.flatMap((f) => entries.filter((e) => e.faction === f));
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/**
 * Tooltip HTML: one row per distinct name, with a faction-coloured stripe on
 * the left. If multiple factions share a name (PMC + Scav use the same exit
 * with one label, e.g. shoreline's "Road to Customs"), the row keeps the
 * neutral stripe from the base CSS rule. Co-located extracts with different
 * names (Customs' Dorms V-Ex + Old Road Gate) give multiple rows, each tagged
 * by its own faction colour. The colour goes inline from FACTION_COLORS —
 * the single source for faction colours, no CSS twin to keep in sync.
 */
/**
 * Plain-text accessible name for a marker (WCAG 4.1.2 / 2.4.4) — Leaflet makes
 * each extract a focusable role="button", so it needs a name. One clause per
 * distinct name with its faction(s): "Dorms V-Ex (PMC); Old Road Gate (Scav)".
 */
export function buildAriaLabel(
  entries: ReadonlyArray<ExtractEntry>,
  factionLabel: (f: FactionKey) => string,
): string {
  const byName = new Map<string, FactionKey[]>();
  const order: string[] = [];
  for (const e of entries) {
    let bucket = byName.get(e.name);
    if (!bucket) {
      bucket = [];
      byName.set(e.name, bucket);
      order.push(e.name);
    }
    bucket.push(e.faction);
  }
  return order
    .map((name) => `${name} (${byName.get(name)!.map(factionLabel).join(', ')})`)
    .join('; ');
}

export function buildTooltipHtml(entries: ReadonlyArray<ExtractEntry>): string {
  const factionsByName = new Map<string, FactionKey[]>();
  // Preserve first-seen name order so the layout matches FACTION_ORDER input.
  const order: string[] = [];
  for (const e of entries) {
    let bucket = factionsByName.get(e.name);
    if (!bucket) {
      bucket = [];
      factionsByName.set(e.name, bucket);
      order.push(e.name);
    }
    bucket.push(e.faction);
  }
  return order
    .map((name) => {
      const factions = factionsByName.get(name)!;
      const stripe =
        factions.length === 1 ? ` style="border-left-color: ${FACTION_COLORS[factions[0]!]}"` : '';
      return `<div class="extract-tooltip-row"${stripe}>${escapeHtml(name)}</div>`;
    })
    .join('');
}
