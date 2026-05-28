import { z } from 'zod';

export const pathSourceSchema = z.enum(['env', 'manual', 'detected', 'missing']);

export const resolvedPathSchema = z.object({
  value: z.string().nullable(),
  source: pathSourceSchema,
  exists: z.boolean(),
});

export const serverConfigResponseSchema = z.object({
  gameDir: resolvedPathSchema,
  logsDir: resolvedPathSchema,
  screenshotsDir: resolvedPathSchema,
});

/**
 * PUT body. Each field is optional; only the keys present are updated.
 * Setting a field to null clears that manual override (revert to env or
 * detected default). Setting to a string saves it as the manual value.
 */
export const serverConfigUpdateSchema = z.object({
  gameDir: z.string().nullable().optional(),
  screenshotsDir: z.string().nullable().optional(),
});

export type PathSource = z.infer<typeof pathSourceSchema>;
export type ResolvedPath = z.infer<typeof resolvedPathSchema>;
export type ServerConfigResponse = z.infer<typeof serverConfigResponseSchema>;
export type ServerConfigUpdate = z.infer<typeof serverConfigUpdateSchema>;
