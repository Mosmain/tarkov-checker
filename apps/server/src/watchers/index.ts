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

  log.info(
    {
      env: {
        TARKOV_SCREENSHOT_DIR: process.env["TARKOV_SCREENSHOT_DIR"] ?? "(unset)",
        TARKOV_LOG_DIR: process.env["TARKOV_LOG_DIR"] ?? "(unset)",
        LOCALAPPDATA: process.env["LOCALAPPDATA"] ?? "(unset)",
        OneDrive: process.env["OneDrive"] ?? "(unset)",
        USERPROFILE: process.env["USERPROFILE"] ?? "(unset)",
      },
      screenshotCandidates: paths.screenshotCandidates,
      logCandidates: paths.logCandidates,
    },
    "watcher path discovery",
  );

  if (dirExists(paths.screenshotDir) && paths.screenshotDir) {
    handles.push(startScreenshotWatcher(paths.screenshotDir, hub, log));
  } else {
    log.warn(
      "no screenshot dir found — F12 player marker pipeline is dormant. Set TARKOV_SCREENSHOT_DIR to the absolute path Tarkov writes screenshots into, then restart pnpm dev.",
    );
  }

  // TODO: log watcher (raid-start / raid-end / map detection) lands here next.
  if (!dirExists(paths.logDir)) {
    log.info("tarkov log dir not found — log watcher is not implemented yet either, ignore");
  }

  return {
    stopAll: async () => {
      await Promise.all(handles.map((h) => h.stop()));
    },
  };
}
