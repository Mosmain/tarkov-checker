import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { serverConfigUpdateSchema } from '@tarkov-checker/shared';
import { Hub, registerSse } from './sse.js';
import { resolvePaths, WatcherManager } from './watchers/index.js';
import { ConfigStore } from './config-store.js';

const isDev = process.env['NODE_ENV'] !== 'production';
// Distinct from Vite's PORT — preview tools sometimes set PORT for the
// whole dev runner, and Fastify must stay on 3000 regardless.
const PORT = Number(process.env['SERVER_PORT'] ?? 3000);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.resolve(__dirname, '..', 'data', 'config.json');
// apps/server/dist/ → apps/client/dist/. In dev there's no client/dist
// yet (the user runs `vite dev` separately), so static serving is
// conditionally registered below.
const CLIENT_DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');

const app = Fastify({
  logger: isDev
    ? {
        level: 'info',
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }
    : { level: 'info' },
});

app.get('/health', () => ({ ok: true, t: Date.now() }));

const hub = new Hub();
registerSse(app, hub);

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

// Prod path: Fastify owns the whole user-facing surface — built SPA plus
// the same /api + /events routes the dev Vite server proxies onto us.
// Dev path (no client/dist yet): Vite serves the SPA on :5173 and proxies
// us — we just answer /api and /events here.
if (fs.existsSync(CLIENT_DIST)) {
  await app.register(fastifyStatic, { root: CLIENT_DIST, wildcard: false });
  // SPA fallback so vue-router history mode works on hard refresh. Don't
  // swallow API/SSE 404s — those should stay JSON errors, not HTML.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/events')) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    return reply.sendFile('index.html');
  });
  app.log.info({ root: CLIENT_DIST }, 'serving built SPA from /');
} else {
  app.log.info({ tried: CLIENT_DIST }, 'no built SPA on disk — dev mode, Vite will proxy us');
}

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
