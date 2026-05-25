import chokidar from "chokidar";
import type { FastifyBaseLogger } from "fastify";
import { parseScreenshotFilename } from "@tarkov-checker/shared";
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
    const position = parseScreenshotFilename(filePath);
    if (!position) return;
    log.info({ filePath, position }, "screenshot position");
    hub.broadcast({
      type: "position",
      t: Date.now(),
      x: position.x,
      y: position.y,
      z: position.z,
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
