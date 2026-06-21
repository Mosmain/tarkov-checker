import { canonicalMapCode, type FactionKey } from '@shared/maps';

export interface Position3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ExtractData {
  /** Stable per-map id. The display name lives in i18n: `extractNames.<mapId>.<key>`. */
  readonly key: string;
  /** Factions that can use this exit. Multi-faction = same physical location, multiple owners. */
  readonly factions: ReadonlyArray<FactionKey>;
  readonly position: Position3D;
}

/**
 * One JSON file per canonical map under ./extracts/. Vite's `import.meta.glob`
 * with `eager: true` pulls every file into the bundle at build time, so adding
 * a new map is just dropping a file — no manual list to keep in sync.
 *
 * The JSON files are hand-curated against the same key space as TARKOV_MAPS;
 * no runtime validation needed (shape drift would surface at edit time).
 */
const modules = import.meta.glob<{ default: ExtractData[] }>('./extracts/*.json', {
  eager: true,
});

const EXTRACTS_BY_CODE: Record<string, ReadonlyArray<ExtractData>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = /\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  EXTRACTS_BY_CODE[match[1]!] = mod.default;
}

/**
 * Static lookup over the curated dataset. Aliases (factory4_night,
 * sandbox_high, ...) resolve to their canonical entry via maps.ts — the
 * data tree only stores one file per logical map.
 */
export function extractsForMap(rawCode: string): ReadonlyArray<ExtractData> | null {
  const canonical = canonicalMapCode(rawCode);
  return EXTRACTS_BY_CODE[canonical] ?? null;
}

/** Factions that actually have at least one exit on the given map — the
 * faction filter only offers these (no shared exits on Factory, etc.). */
export function factionsForMap(rawCode: string): ReadonlySet<FactionKey> {
  const present = new Set<FactionKey>();
  for (const ex of extractsForMap(rawCode) ?? []) {
    for (const faction of ex.factions) present.add(faction);
  }
  return present;
}
