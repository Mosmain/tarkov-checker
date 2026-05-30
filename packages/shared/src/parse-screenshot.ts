export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface ParsedScreenshot {
  position: Position3D;
  orientation: Quaternion | null;
}

/**
 * Tarkov position-overlay screenshots (PrintScreen by default) embed the
 * player's world position and
 * orientation in their filename. Recent builds use:
 *
 *   YYYY-MM-DD[HH-MM-SS]_<x>, <y>, <z>_<qx>, <qy>, <qz>, <qw>_<fov> (<n>).png
 *
 * Example:
 *   2024-04-12[12-34-56]_-15.4, 1.5, -23.8_-0.1, 0.7, -0.0, 0.7_75 (0).png
 *
 * We anchor on `_X, Y, Z_` (between underscores) for the position and look
 * for an optional `<a>, <b>, <c>, <d>_` immediately after it for the
 * orientation quaternion. Either may shift between patches, so failure to
 * find the quaternion just nulls the orientation field rather than
 * discarding the whole match.
 */
const NUM = '-?\\d+(?:\\.\\d+)?';
const POSITION_RE = new RegExp(`_(${NUM}),\\s*(${NUM}),\\s*(${NUM})_`);
const ORIENTATION_RE = new RegExp(
  `_(${NUM}),\\s*(${NUM}),\\s*(${NUM})_(${NUM}),\\s*(${NUM}),\\s*(${NUM}),\\s*(${NUM})_`,
);

function basename(filePath: string): string {
  const cleaned = filePath.replace(/\\/g, '/');
  const slash = cleaned.lastIndexOf('/');
  return slash === -1 ? cleaned : cleaned.slice(slash + 1);
}

export function parseScreenshotFilename(filename: string): ParsedScreenshot | null {
  const base = basename(filename);
  if (!base.toLowerCase().endsWith('.png')) return null;
  const posMatch = POSITION_RE.exec(base);
  if (!posMatch) return null;
  const x = Number(posMatch[1]);
  const y = Number(posMatch[2]);
  const z = Number(posMatch[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const position: Position3D = { x, y, z };

  const orientMatch = ORIENTATION_RE.exec(base);
  let orientation: Quaternion | null = null;
  if (orientMatch) {
    const qx = Number(orientMatch[4]);
    const qy = Number(orientMatch[5]);
    const qz = Number(orientMatch[6]);
    const qw = Number(orientMatch[7]);
    if ([qx, qy, qz, qw].every(Number.isFinite)) orientation = { qx, qy, qz, qw };
  }

  return { position, orientation };
}

/**
 * Extracts the yaw angle (rotation around the world Y axis) from a Tarkov
 * orientation quaternion. Result is in degrees, 0 = facing world +Z, positive
 * = clockwise looking down from above (so +90° turns the player to in-game
 * +X, "east"). Tarkov uses Unity-style left-handed Y-up coordinates.
 */
export function quaternionToYawDegrees(q: Quaternion): number {
  const { qx, qy, qz, qw } = q;
  const sinYaw = 2 * (qw * qy + qz * qx);
  const cosYaw = 1 - 2 * (qx * qx + qy * qy);
  const rad = Math.atan2(sinYaw, cosYaw);
  return (rad * 180) / Math.PI;
}
