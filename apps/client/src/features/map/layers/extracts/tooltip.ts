import type { FactionKey } from '@shared/maps';
import { FACTION_ORDER } from './icon';

export interface ExtractEntry {
  readonly faction: FactionKey;
  readonly name: string;
}

/** Sort entries by canonical faction order so visuals are deterministic. */
export function sortedEntries(
  entries: ReadonlyArray<ExtractEntry>,
): Array<ExtractEntry> {
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
 * with one label, e.g. shoreline's "Road to Customs"), the row is neutral.
 * Co-located extracts with different names (Customs' Dorms V-Ex + Old Road
 * Gate) give multiple rows, each tagged by its own faction colour.
 */
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
      const cls =
        factions.length === 1
          ? `extract-tooltip-row--${factions[0]!}`
          : 'extract-tooltip-row--multi';
      return `<div class="extract-tooltip-row ${cls}">${escapeHtml(name)}</div>`;
    })
    .join('');
}
