import type { Position3D } from "./tarkov-api.js";

function basename(filePath: string): string {
  const cleaned = filePath.replace(/\\/g, "/");
  const slash = cleaned.lastIndexOf("/");
  return slash === -1 ? cleaned : cleaned.slice(slash + 1);
}

/**
 * Tarkov F12-overlay screenshots embed the player's world position in their
 * filename. The format observed in recent builds:
 *
 *   YYYY-MM-DD[HH-MM-SS]_<x>, <y>, <z>_<qx>, <qy>, <qz>, <qw>_<fov> (<n>).png
 *
 * Example:
 *   2024-04-12[12-34-56]_-15.4, 1.5, -23.8_-0.1, 0.7, -0.0, 0.7_75 (0).png
 *
 * We anchor on the first `_X, Y, Z_` triple between underscores rather than
 * the full strict regex so minor formatting shifts between patches stay
 * tolerant. Returns null for files we can't recognize (so unrelated PNGs in
 * the same folder are silently ignored).
 */
const POSITION_RE = /_(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)_/;

export function parseScreenshotFilename(filename: string): Position3D | null {
  const base = basename(filename);
  if (!base.toLowerCase().endsWith(".png")) return null;
  const match = POSITION_RE.exec(base);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const z = Number(match[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}
