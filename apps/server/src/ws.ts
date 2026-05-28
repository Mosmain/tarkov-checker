import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { ServerMessage } from '@tarkov-checker/shared';

const HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * Connection registry + fan-out helper. The Fastify ws plugin gives us one
 * callback per connection; watchers need to push a single message to every
 * connected client without knowing the socket set.
 */
export class Hub {
  private clients = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.clients.add(socket);
  }

  remove(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  broadcast(message: ServerMessage): void {
    if (this.clients.size === 0) return;
    const text = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(text);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

function sendIfOpen(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export async function registerWebSocket(app: FastifyInstance, hub: Hub): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, req) => {
    app.log.info({ ip: req.ip }, 'ws client connected');
    hub.add(socket);

    sendIfOpen(socket, { type: 'heartbeat', t: Date.now() });

    const interval = setInterval(() => {
      sendIfOpen(socket, { type: 'heartbeat', t: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);

    socket.on('close', () => {
      clearInterval(interval);
      hub.remove(socket);
      app.log.info('ws client disconnected');
    });

    socket.on('error', (err: Error) => {
      app.log.warn({ err }, 'ws client error');
    });
  });
}
