import type { FastifyInstance } from "fastify";
import type { ServerMessage } from "@tarkov-checker/shared";

const HEARTBEAT_INTERVAL_MS = 5_000;

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, (socket, req) => {
    app.log.info({ ip: req.ip }, "ws client connected");

    const send = (msg: ServerMessage): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    };

    send({ type: "heartbeat", t: Date.now() });

    const interval = setInterval(() => {
      send({ type: "heartbeat", t: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);

    socket.on("close", () => {
      clearInterval(interval);
      app.log.info("ws client disconnected");
    });

    socket.on("error", (err) => {
      app.log.warn({ err }, "ws client error");
    });
  });
}
