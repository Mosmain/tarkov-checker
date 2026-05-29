import type { FastifyBaseLogger } from 'fastify';
import type { ResolvedPaths } from './paths.js';
import { startScreenshotWatcher, type ScreenshotWatcher } from './screenshots.js';
import { startLogsWatcher, type LogsWatcher } from './logs.js';
import type { Hub } from '../sse.js';

export { resolvePaths } from './paths.js';
export type { ResolvedPath, ResolvedPaths, PathSource, ManualOverrides } from './paths.js';
export { detectDocumentsDir, detectTarkovGameDir } from './registry.js';
export { parseScreenshotFilename } from '@tarkov-checker/shared';

/**
 * Long-lived watcher process owner. Holds whatever handles are currently
 * active and can swap them all out atomically on a config change.
 */
export class WatcherManager {
  private handles: Array<{ stop: () => Promise<void> }> = [];

  constructor(
    private readonly hub: Hub,
    private readonly log: FastifyBaseLogger,
  ) {}

  async apply(paths: ResolvedPaths): Promise<void> {
    await this.stopAll();

    if (paths.screenshotsDir.exists && paths.screenshotsDir.value) {
      this.handles.push(
        startScreenshotWatcher(paths.screenshotsDir.value, this.hub, this.log) as ScreenshotWatcher,
      );
    } else {
      this.log.warn(
        {
          screenshotsDir: paths.screenshotsDir.value ?? '(unset)',
          source: paths.screenshotsDir.source,
          exists: paths.screenshotsDir.exists,
        },
        'screenshots dir is not usable — player marker pipeline dormant',
      );
    }

    if (paths.logsDir.exists && paths.logsDir.value) {
      this.handles.push(
        startLogsWatcher(paths.logsDir.value, this.hub, this.log) as LogsWatcher,
      );
    } else {
      this.log.info(
        {
          logsDir: paths.logsDir.value ?? '(unset)',
          source: paths.logsDir.source,
        },
        'logs dir not usable — map auto-switch pipeline dormant',
      );
    }
  }

  async stopAll(): Promise<void> {
    const old = this.handles;
    this.handles = [];
    await Promise.all(old.map((h) => h.stop()));
  }
}
