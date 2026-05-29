import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { ServerMessage } from '@tarkov-checker/shared';

// Keep idle connections alive across reverse proxies that drop quiet sockets
// (nginx default proxy_read_timeout is 60s). Harmless on a direct LAN link.
const KEEPALIVE_INTERVAL_MS = 25_000;

/**
 * Connection registry + fan-out helper. The SSE route hands us one open
 * response per client; watchers push a single message to every connected
 * client without knowing the response set.
 */
export class Hub {
  private clients = new Set<ServerResponse>();

  add(res: ServerResponse): void {
    this.clients.add(res);
  }

  remove(res: ServerResponse): void {
    this.clients.delete(res);
  }

  broadcast(message: ServerMessage): void {
    if (this.clients.size === 0) return;
    const frame = `data: ${JSON.stringify(message)}\n\n`;
    for (const res of this.clients) {
      res.write(frame);
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export function registerSse(app: FastifyInstance, hub: Hub): void {
  app.get('/events', (req, reply) => {
    // Take over the socket: we stream manually via reply.raw and never call
    // reply.send, so Fastify must not try to serialize a response.
    reply.hijack();
    const res = reply.raw;

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    };
    // EventSource obeys CORS (WebSocket didn't): the page is served from a
    // different origin (:5173) than this server (:3000). hijack() bypasses
    // @fastify/cors's reply hook, so mirror its `origin: true` policy here by
    // reflecting the request origin — otherwise the browser won't read the
    // stream. EventSource defaults to withCredentials=false, so no
    // Allow-Credentials header is needed.
    const origin = req.headers.origin;
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(200, headers);
    // Flush headers + open the stream so the client's onopen fires promptly.
    res.write(': connected\n\n');

    hub.add(res);
    app.log.info({ ip: req.ip }, 'sse client connected');

    const keepalive = setInterval(() => {
      res.write(': ping\n\n');
    }, KEEPALIVE_INTERVAL_MS);

    req.raw.on('close', () => {
      clearInterval(keepalive);
      hub.remove(res);
      app.log.info('sse client disconnected');
    });
  });
}
