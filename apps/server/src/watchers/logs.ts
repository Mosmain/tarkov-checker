import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { FastifyBaseLogger } from 'fastify';
import { parseLogLine } from '@tarkov-checker/shared';
import type { Hub } from '../sse.js';

export interface LogsWatcher {
  stop: () => Promise<void>;
}

const SESSION_FOLDER_PREFIX = 'log_';
const APPLICATION_LOG_RE = /^.+ application_(\d+)\.log$/;

/**
 * Tail follower for a single growing log file. Tracks byte offset and
 * line-buffers partial reads (Tarkov writes lines with a trailing newline,
 * but a `change` event can fire mid-line). Reset on truncation (offset >
 * size) — rare for Tarkov logs but cheap to handle.
 */
class LogTail {
  private offset = 0;
  private partial = '';
  private readonly watcher: FSWatcher;
  private reading = false;
  private rereadPending = false;
  private stopped = false;

  constructor(
    private readonly filePath: string,
    private readonly onLine: (line: string) => void,
    private readonly log: FastifyBaseLogger,
  ) {
    try {
      // Start at EOF — we don't want to replay historical map switches on
      // startup. (Initial-state seeding is done explicitly by the parent
      // watcher before this tail is created.)
      this.offset = fs.statSync(filePath).size;
    } catch (err) {
      this.log.warn({ err, filePath }, 'log tail: initial stat failed');
    }

    this.watcher = chokidar.watch(filePath, {
      ignoreInitial: true,
      persistent: true,
      // Tail-style follow needs polling on Windows — fs.watch fires once per
      // OS notification, which Tarkov's flush cadence (~1Hz) tends to miss.
      usePolling: true,
      interval: 300,
    });
    this.watcher.on('change', () => void this.readNew());
    this.watcher.on('error', (err: unknown) => {
      this.log.warn({ err, filePath }, 'log tail: chokidar error');
    });
  }

  private async readNew(): Promise<void> {
    if (this.stopped) return;
    if (this.reading) {
      // Coalesce: a second change while we're mid-read just sets a flag.
      this.rereadPending = true;
      return;
    }
    this.reading = true;
    try {
      const stat = await fs.promises.stat(this.filePath);
      if (stat.size < this.offset) {
        // Truncation or rotation — start over from the top.
        this.offset = 0;
        this.partial = '';
      }
      if (stat.size === this.offset) return;
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(this.filePath, {
          start: this.offset,
          end: stat.size - 1,
        });
        stream.on('data', (c) => chunks.push(c as Buffer));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      this.offset = stat.size;
      const text = this.partial + Buffer.concat(chunks).toString('utf-8');
      const lines = text.split(/\r?\n/);
      this.partial = lines.pop() ?? '';
      for (const line of lines) {
        if (line.length === 0) continue;
        this.onLine(line);
      }
    } catch (err) {
      this.log.warn({ err, filePath: this.filePath }, 'log tail: read failed');
    } finally {
      this.reading = false;
      if (this.rereadPending) {
        this.rereadPending = false;
        void this.readNew();
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.watcher.close();
  }
}

function listSessionFolders(logsDir: string): string[] {
  try {
    return fs
      .readdirSync(logsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(SESSION_FOLDER_PREFIX))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function pickLatestApplicationLog(sessionFolder: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionFolder, { withFileTypes: true });
  } catch {
    return null;
  }
  let best: { file: string; suffix: number } | null = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = APPLICATION_LOG_RE.exec(e.name);
    if (!m) continue;
    const suffix = Number(m[1]);
    if (!best || suffix > best.suffix) best = { file: e.name, suffix };
  }
  return best ? path.join(sessionFolder, best.file) : null;
}

/**
 * Scans an existing application log from the end for the most recent line
 * that yields a mapId. Lets the overlay snap to the correct map on startup
 * when Tarkov is already mid-raid (or in the lobby after a recent extract).
 *
 * Reads the tail of the file (~64 KB) — Tarkov maps fire several lines per
 * load, so a small window is enough; we don't need to walk gigabytes.
 */
function findLatestMapIdInFile(filePath: string): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const windowSize = Math.min(stat.size, 64 * 1024);
    if (windowSize === 0) return null;
    const buf = Buffer.alloc(windowSize);
    fs.readSync(fd, buf, 0, windowSize, stat.size - windowSize);
    const lines = buf.toString('utf-8').split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = parseLogLine(lines[i]!);
      if (parsed) return parsed.rawMapId;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Watches Tarkov's logs directory and emits `map-change` events whenever the
 * game writes a recognised map-load line to the active session's application
 * log. Lifecycle:
 *
 *   1. On start: find the latest `log_*` folder + its highest
 *      `application_NNN.log`, scan its tail for a recent map id, emit one
 *      `map-change` if found (overlay snaps to current/last map).
 *   2. Tail that file from EOF.
 *   3. Watch `logsDir` for new `log_*` folders (new game launch). When one
 *      appears, drop the previous tail and re-seed from the new folder.
 *   4. Watch the active folder for higher-suffix `application_NNN.log` files
 *      (within-session rotation) and switch the tail to the newer file.
 *
 * Dedupes consecutive emits of the same id so the explicit `rcid:` line and
 * the later `Location:` confirmation collapse into a single broadcast.
 */
export function startLogsWatcher(
  logsDir: string,
  hub: Hub,
  log: FastifyBaseLogger,
): LogsWatcher {
  let lastEmittedMapId: string | null = null;
  let activeSession: { folder: string; logFile: string; tail: LogTail } | null = null;
  let sessionFolderWatcher: FSWatcher | null = null;
  let activeFolderWatcher: FSWatcher | null = null;
  let stopped = false;

  const emitMapChange = (rawMapId: string): void => {
    if (rawMapId === lastEmittedMapId) return;
    lastEmittedMapId = rawMapId;
    log.info({ rawMapId }, 'map change detected');
    hub.broadcast({ type: 'map-change', t: Date.now(), rawMapId });
  };

  const handleLine = (line: string): void => {
    const parsed = parseLogLine(line);
    if (parsed) emitMapChange(parsed.rawMapId);
  };

  const closeActiveFolderWatcher = async (): Promise<void> => {
    if (activeFolderWatcher) {
      await activeFolderWatcher.close();
      activeFolderWatcher = null;
    }
  };

  const switchToLogFile = async (folder: string, logFile: string): Promise<void> => {
    if (activeSession?.logFile === logFile) return;
    if (activeSession) {
      await activeSession.tail.stop();
    }
    activeSession = { folder, logFile, tail: new LogTail(logFile, handleLine, log) };
    log.info({ folder, logFile }, 'tailing log file');
  };

  const attachToSession = async (folder: string, seedFromExisting: boolean): Promise<void> => {
    await closeActiveFolderWatcher();
    if (activeSession) {
      await activeSession.tail.stop();
      activeSession = null;
    }
    const logFile = pickLatestApplicationLog(folder);
    if (!logFile) {
      // Folder just appeared but the game hasn't written any log file yet —
      // wait for it via the per-folder watcher below.
      log.info({ folder }, 'log session folder has no application_NNN.log yet');
    } else {
      if (seedFromExisting) {
        const seeded = findLatestMapIdInFile(logFile);
        if (seeded) {
          log.info({ rawMapId: seeded }, 'seeding map from latest log entry');
          emitMapChange(seeded);
        }
      }
      await switchToLogFile(folder, logFile);
    }

    // Watch the session folder for rotations (new `application_NNN.log` with
    // a higher suffix, or the very first one if the folder was empty on
    // arrival).
    activeFolderWatcher = chokidar.watch(folder, {
      ignoreInitial: true,
      persistent: true,
      depth: 0,
    });
    activeFolderWatcher.on('add', (filePath: string) => {
      const m = APPLICATION_LOG_RE.exec(path.basename(filePath));
      if (!m) return;
      const newSuffix = Number(m[1]);
      const currentMatch = activeSession
        ? APPLICATION_LOG_RE.exec(path.basename(activeSession.logFile))
        : null;
      const currentSuffix = currentMatch ? Number(currentMatch[1]) : -1;
      if (newSuffix > currentSuffix) {
        void switchToLogFile(folder, filePath);
      }
    });
    activeFolderWatcher.on('error', (err: unknown) => {
      log.warn({ err, folder }, 'log folder watcher error');
    });
  };

  const onSessionFolderSeen = (dir: string): void => {
    if (stopped) return;
    const name = path.basename(dir);
    if (!name.startsWith(SESSION_FOLDER_PREFIX)) return;
    if (activeSession && name <= path.basename(activeSession.folder)) return;
    log.info({ folder: dir }, 'new tarkov log session detected');
    // Don't seed from a brand-new session: it has nothing in it yet, and if
    // it ever does, the tail will pick those lines up live.
    void attachToSession(dir, /* seedFromExisting */ false);
  };

  // Initial scan: pick the latest existing log folder and seed from it.
  const folders = listSessionFolders(logsDir);
  if (folders.length > 0) {
    const latest = folders[folders.length - 1]!;
    void attachToSession(path.join(logsDir, latest), /* seedFromExisting */ true);
  } else {
    log.info({ logsDir }, 'no existing tarkov log sessions yet — waiting for first launch');
  }

  // Watch the parent for fresh session folders (next game launch).
  sessionFolderWatcher = chokidar.watch(logsDir, {
    ignoreInitial: true,
    persistent: true,
    depth: 0,
  });
  sessionFolderWatcher.on('addDir', onSessionFolderSeen);
  sessionFolderWatcher.on('error', (err: unknown) => {
    log.warn({ err, logsDir }, 'logs dir watcher error');
  });

  log.info({ logsDir }, 'logs watcher started');

  return {
    stop: async () => {
      stopped = true;
      await Promise.all([
        sessionFolderWatcher?.close(),
        closeActiveFolderWatcher(),
        activeSession?.tail.stop(),
      ]);
      sessionFolderWatcher = null;
      activeSession = null;
    },
  };
}
