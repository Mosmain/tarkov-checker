import { z } from 'zod';

export const positionMessage = z.object({
  type: z.literal('position'),
  t: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  /** In-game yaw in degrees (clockwise from +Z), null when the screenshot
   * filename didn't carry an orientation quaternion. */
  yaw: z.number().nullable().optional(),
});

export const mapChangeMessage = z.object({
  type: z.literal('map-change'),
  t: z.number().int().nonnegative(),
  /** Raw mapId as logged by the game (e.g. "bigmap", "factory4_night",
   * "sandbox_high"). The client resolves aliases through
   * `canonicalMapCode()` from `@shared/maps`. */
  rawMapId: z.string(),
});

/** Action codes the backend forwards to every client on a global-hotkey
 * press. Single source of truth for the wire enum; mirrored by the Rust
 * `HotkeyAction` (kebab-case) and consumed by `@shared/hotkeys-api`. */
export const hotkeyActions = ['zoom-in', 'zoom-out', 'floor-up', 'floor-down', 'airdrop'] as const;

/** Backend-owned global hotkey fired. The OS-level shortcut lives in the
 * helper process, so this reaches the overlay webview (Tauri `command`
 * event) AND every browser/phone client (SSE `/events`) identically. */
export const commandMessage = z.object({
  type: z.literal('command'),
  action: z.enum(hotkeyActions),
});

export const serverMessage = z.discriminatedUnion('type', [
  positionMessage,
  mapChangeMessage,
  commandMessage,
]);

export type PositionMessage = z.infer<typeof positionMessage>;
export type MapChangeMessage = z.infer<typeof mapChangeMessage>;
export type CommandMessage = z.infer<typeof commandMessage>;
export type HotkeyActionCode = (typeof hotkeyActions)[number];
export type ServerMessage = z.infer<typeof serverMessage>;
export type ServerMessageType = ServerMessage['type'];
