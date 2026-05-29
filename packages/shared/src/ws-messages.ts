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

export const serverMessage = z.discriminatedUnion('type', [positionMessage, mapChangeMessage]);

export type PositionMessage = z.infer<typeof positionMessage>;
export type MapChangeMessage = z.infer<typeof mapChangeMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ServerMessageType = ServerMessage['type'];
