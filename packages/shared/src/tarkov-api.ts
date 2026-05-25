import { z } from "zod";

export const position3d = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const extractFaction = z.enum(["pmc", "scav", "shared"]);

export const extract = z.object({
  name: z.string(),
  faction: extractFaction.nullable(),
  position: position3d,
});

export const mapExtracts = z.object({
  nameId: z.string(),
  name: z.string(),
  extracts: z.array(extract),
});

export const extractsCacheResponse = z.object({
  lang: z.string(),
  fetchedAt: z.number().int().nonnegative(),
  data: z.array(mapExtracts),
});

export type ExtractsCacheResponse = z.infer<typeof extractsCacheResponse>;

export type Position3D = z.infer<typeof position3d>;
export type ExtractFaction = z.infer<typeof extractFaction>;
export type Extract = z.infer<typeof extract>;
export type MapExtracts = z.infer<typeof mapExtracts>;
