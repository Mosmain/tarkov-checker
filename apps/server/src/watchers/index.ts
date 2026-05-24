// TODO: implement game log + screenshot folder watchers.
//
// Will use chokidar to watch:
//   - Escape from Tarkov log directory (raid lifecycle events)
//   - Screenshots directory (player coordinates parsed from filenames)
//
// Both paths are platform-specific and should be discovered via env vars
// or a config file, with sensible Windows defaults. Validate every parsed
// payload with zod before broadcasting.

export interface WatcherPaths {
  logDir: string;
  screenshotDir: string;
}

export function resolveWatcherPaths(): WatcherPaths {
  // TODO: discover real paths. For now, surface explicit env vars only.
  return {
    logDir: process.env["TARKOV_LOG_DIR"] ?? "",
    screenshotDir: process.env["TARKOV_SCREENSHOT_DIR"] ?? "",
  };
}
