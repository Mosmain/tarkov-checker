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

/** Position is the only message the server pushes to clients. */
export const serverMessage = positionMessage;

export type PositionMessage = z.infer<typeof positionMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ServerMessageType = ServerMessage['type'];
