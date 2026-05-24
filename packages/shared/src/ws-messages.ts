import { z } from "zod";

export const heartbeatMessage = z.object({
  type: z.literal("heartbeat"),
  t: z.number().int().nonnegative(),
});

export const raidStartMessage = z.object({
  type: z.literal("raid-start"),
  t: z.number().int().nonnegative(),
  mapCode: z.string(),
});

export const raidEndMessage = z.object({
  type: z.literal("raid-end"),
  t: z.number().int().nonnegative(),
});

export const positionMessage = z.object({
  type: z.literal("position"),
  t: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const serverMessage = z.discriminatedUnion("type", [
  heartbeatMessage,
  raidStartMessage,
  raidEndMessage,
  positionMessage,
]);

export type HeartbeatMessage = z.infer<typeof heartbeatMessage>;
export type RaidStartMessage = z.infer<typeof raidStartMessage>;
export type RaidEndMessage = z.infer<typeof raidEndMessage>;
export type PositionMessage = z.infer<typeof positionMessage>;
export type ServerMessage = z.infer<typeof serverMessage>;
export type ServerMessageType = ServerMessage["type"];
