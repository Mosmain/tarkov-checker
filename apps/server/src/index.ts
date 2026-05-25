import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { Hub, registerWebSocket } from "./ws.js";
import { startWatchers } from "./watchers/index.js";

const isDev = process.env["NODE_ENV"] !== "production";
const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

const app = Fastify({
  logger: isDev
    ? {
        level: "info",
        transport: { target: "pino-pretty", options: { colorize: true } },
      }
    : { level: "info" },
});

await app.register(cors, { origin: true });
await app.register(websocket);

app.get("/health", () => ({ ok: true, t: Date.now() }));

const hub = new Hub();
await registerWebSocket(app, hub);

const watchers = startWatchers(hub, app.log);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await watchers.stopAll();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
