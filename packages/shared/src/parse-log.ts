export interface ParsedLogMapLine {
  rawMapId: string;
}

/**
 * Tarkov writes pipe-delimited lines to `Logs/log_<ts>_<session>/<ts>
 * application_NNN.log` during a session. Three line shapes reveal the map id
 * the player is loading into (in temporal order):
 *
 *   ...|Info|application|scene preset path:maps/<file>_preset.bundle rcid:<id>.scenespreset.asset
 *   ...|Info|application|[Transit] Flag:None, RaidId:<id>, Count:0, Locations:<id> -> <maybe-next>
 *   ...|Debug|application|TRACE-NetworkGameCreate profileStatus: '... Location: <id>, Sid: ...'
 *
 * The `scene preset` line is the earliest signal (~30s before the player
 * loads in) — primary trigger. The `[Transit]` line fires after
 * `LocationLoaded` and is more stable: BSG renamed several bundle keys in
 * patch 1.0.5.0 (factory4_day → factory_day in the rcid, but `[Transit]
 * Locations:` still emits the canonical legacy id), so it's our backup that
 * doesn't need alias maintenance. The `TRACE-NetworkGameCreate profileStatus`
 * line was removed in 1.0.5.0 but we keep the pattern as a fallback so
 * historical logs still parse.
 *
 * Tarkov varies the case across these three sources for the same map:
 *   rcid:   `factory_day` / `city` / `bigmap`             (lowercase)
 *   Transit: `RezervBase` / `TarkovStreets` / `Sandbox_high` (PascalCase)
 *   Location: `bigmap`                                    (lowercase, pre-1.0.5.0)
 *
 * The captured id is normalised to lowercase here so callers can use it as
 * a stable lookup key against `TARKOV_MAPS` (whose keys are all lowercase).
 * Aliases (`factory_day` → `factory4_day`, `city` → `tarkovstreets`,
 * `rezerv_base` → `rezervbase`, etc.) are resolved by `canonicalMapCode()`
 * in `@shared/maps`.
 */
const SCENE_PRESET_RE = /\brcid:([A-Za-z0-9_]+)\.scenespreset\.asset\b/;
const TRANSIT_LOCATION_RE = /\[Transit\].*\bLocations:([A-Za-z0-9_]+)/;
const TRACE_LOCATION_RE = /\bLocation:\s+([A-Za-z0-9_]+)\s*,\s*Sid:/;

export function parseLogLine(line: string): ParsedLogMapLine | null {
  const m =
    SCENE_PRESET_RE.exec(line) ??
    TRANSIT_LOCATION_RE.exec(line) ??
    TRACE_LOCATION_RE.exec(line);
  if (!m || !m[1]) return null;
  return { rawMapId: m[1].toLowerCase() };
}
