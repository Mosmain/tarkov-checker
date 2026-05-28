import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { serverConfigUpdateSchema } from '@tarkov-checker/shared';
import { Hub, registerWebSocket } from './ws.js';
import { resolvePaths, WatcherManager } from './watchers/index.js';
import { ConfigStore } from './config-store.js';
import { ExtractsCache } from './extracts-cache.js';

const isDev = process.env['NODE_ENV'] !== 'production';
// Distinct from Vite's PORT — preview tools sometimes set PORT for the
// whole dev runner, and Fastify must stay on 3000 regardless.
const PORT = Number(process.env['SERVER_PORT'] ?? 3000);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.resolve(__dirname, '..', 'data', 'config.json');
const EXTRACTS_CACHE_FILE = path.resolve(__dirname, '..', 'data', 'extracts-cache.json');

const app = Fastify({
  logger: isDev
    ? {
        level: 'info',
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }
    : { level: 'info' },
});

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});
await app.register(websocket);

app.get('/health', () => ({ ok: true, t: Date.now() }));

const hub = new Hub();
await registerWebSocket(app, hub);

const configStore = new ConfigStore(CONFIG_FILE);
await configStore.load();

const watchers = new WatcherManager(hub, app.log);
{
  const paths = await resolvePaths(configStore.overrides);
  app.log.info({ paths }, 'initial path resolution');
  await watchers.apply(paths);
}

app.get('/api/config', async () => resolvePaths(configStore.overrides));

app.put('/api/config', async (req, reply) => {
  const parsed = serverConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400);
    return { error: parsed.error.flatten() };
  }
  await configStore.update(parsed.data);
  const paths = await resolvePaths(configStore.overrides);
  await watchers.apply(paths);
  app.log.info({ paths }, 'config updated, watchers reapplied');
  return paths;
});

const extractsCache = new ExtractsCache(EXTRACTS_CACHE_FILE);
await extractsCache.load();

const langQuerySchema = z.object({
  lang: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[a-z-]+$/),
  refresh: z.union([z.literal('0'), z.literal('1')]).optional(),
});

app.get('/api/extracts', async (req, reply) => {
  const parsed = langQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    reply.code(400);
    return { error: parsed.error.flatten() };
  }
  const { lang, refresh } = parsed.data;
  try {
    const entry =
      refresh === '1' ? await extractsCache.refresh(lang) : await extractsCache.getOrFetch(lang);
    return { lang, fetchedAt: entry.fetchedAt, data: entry.data };
  } catch (err) {
    reply.code(502);
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutting down');
  await watchers.stopAll();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
