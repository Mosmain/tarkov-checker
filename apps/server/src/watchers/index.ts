import type { FastifyBaseLogger } from "fastify";
import { resolveWatcherPaths, dirExists } from "./paths.js";
import { startScreenshotWatcher, type ScreenshotWatcher } from "./screenshots.js";
import type { Hub } from "../ws.js";

export { resolveWatcherPaths } from "./paths.js";
export { parseScreenshotFilename } from "@tarkov-checker/shared";

export interface RunningWatchers {
  stopAll: () => Promise<void>;
}

export function startWatchers(hub: Hub, log: FastifyBaseLogger): RunningWatchers {
  const paths = resolveWatcherPaths();
  const handles: Array<ScreenshotWatcher> = [];

  if (paths.screenshotDir && dirExists(paths.screenshotDir)) {
    handles.push(startScreenshotWatcher(paths.screenshotDir, hub, log));
  } else {
    log.warn(
      { screenshotDir: paths.screenshotDir ?? "(unset)" },
      "TARKOV_SCREENSHOT_DIR is not set or does not exist — set it in .env to enable the player marker pipeline",
    );
  }

  // TODO: log watcher (raid-start / raid-end / map detection) lands here next.
  if (!dirExists(paths.logDir)) {
    log.info(
      { logDir: paths.logDir ?? "(unset)" },
      "TARKOV_LOG_DIR is not set or does not exist — log watcher is not implemented yet either, ignore",
    );
  }

  return {
    stopAll: async () => {
      await Promise.all(handles.map((h) => h.stop()));
    },
  };
}
