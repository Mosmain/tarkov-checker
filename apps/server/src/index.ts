import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerWebSocket } from "./ws.js";

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

await registerWebSocket(app);

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
