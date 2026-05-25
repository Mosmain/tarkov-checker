import chokidar from "chokidar";
import type { FastifyBaseLogger } from "fastify";
import { parseScreenshotFilename, quaternionToYawDegrees } from "@tarkov-checker/shared";
import type { Hub } from "../ws.js";

export interface ScreenshotWatcher {
  stop: () => Promise<void>;
}

/**
 * Watches the Tarkov screenshots folder. Every new .png that carries a
 * parseable F12-overlay position triple is fanned out to every connected
 * WebSocket client as a `position` message. Files that don't match the
 * pattern are silently ignored — the folder often contains hand-taken
 * screenshots too.
 */
export function startScreenshotWatcher(
  screenshotDir: string,
  hub: Hub,
  log: FastifyBaseLogger,
): ScreenshotWatcher {
  const watcher = chokidar.watch(screenshotDir, {
    ignoreInitial: true,
    persistent: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
  });

  watcher.on("add", (filePath) => {
    const parsed = parseScreenshotFilename(filePath);
    if (!parsed) return;
    const yaw = parsed.orientation ? quaternionToYawDegrees(parsed.orientation) : null;
    log.info({ filePath, position: parsed.position, yaw }, "screenshot position");
    hub.broadcast({
      type: "position",
      t: Date.now(),
      x: parsed.position.x,
      y: parsed.position.y,
      z: parsed.position.z,
      yaw,
    });
  });

  watcher.on("error", (err) => {
    log.warn({ err }, "screenshot watcher error");
  });

  log.info({ screenshotDir }, "screenshot watcher started");

  return {
    stop: () => watcher.close(),
  };
}
