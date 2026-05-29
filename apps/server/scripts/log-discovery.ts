/**
 * Standalone discovery + verification harness for the Tarkov log pipeline.
 * Not wired into the server — runs by hand:
 *
 *   pnpm exec tsx apps/server/scripts/log-discovery.ts [logsDir]
 *
 * Emits three line types on stdout, each prefixed with an ISO timestamp:
 *   [MAP-CHANGE] — `parseLogLine` from @shared returned a hit. This is
 *                  exactly what the prod watcher would broadcast as a
 *                  `map-change` SSE event.
 *   [INTEREST]   — broader keyword set (raid/match/transit/exit/survived
 *                  /killed/MIA/extracted/GameStarted/LocationLoaded/...).
 *                  Captures lines we DON'T parse today — used to discover
 *                  raid-end markers and other v2 signals.
 *   [FS]         — folder/file lifecycle: new session folder appeared,
 *                  new application_NNN.log appeared, rotation happened.
 *
 * Lives next to the server so it shares `@tarkov-checker/shared`, chokidar,
 * and tsx out of the box — no extra setup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { parseLogLine } from '@tarkov-checker/shared';

const DEFAULT_LOGS_DIR = 'D:\\EFT\\Logs';
const SESSION_FOLDER_PREFIX = 'log_';
const APPLICATION_LOG_RE = /^.+ application_(\d+)\.log$/;
const INTEREST_RE =
  /\b(raid|match|matching|transit|exit|exfil|survived|killed|mia|extracted|gamestarted|locationloaded|matchingcompleted|disconnect|raidresult|raidfinished|raidend|endraid|gameended|playerprofile|profile\s*status)\b/i;

const logsDir = process.argv[2] ?? process.env['TARKOV_LOG_DIR'] ?? DEFAULT_LOGS_DIR;

function ts(): string {
  return new Date().toISOString();
}

function out(channel: string, msg: string): void {
  console.log(`${ts()} [${channel}] ${msg}`);
}

function truncate(s: string, n = 240): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function listSessionFolders(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(SESSION_FOLDER_PREFIX))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function pickLatestApplicationLog(folder: string): { file: string; suffix: number } | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  let best: { file: string; suffix: number } | null = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = APPLICATION_LOG_RE.exec(e.name);
    if (!m) continue;
    const suffix = Number(m[1]);
    if (!best || suffix > best.suffix) best = { file: path.join(folder, e.name), suffix };
  }
  return best;
}

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
  ) {
    try {
      this.offset = fs.statSync(filePath).size;
    } catch {
      this.offset = 0;
    }
    this.watcher = chokidar.watch(filePath, {
      ignoreInitial: true,
      persistent: true,
      usePolling: true,
      interval: 300,
    });
    this.watcher.on('change', () => void this.readNew());
    this.watcher.on('error', (err: unknown) => out('ERROR', `tail watcher: ${String(err)}`));
  }

  private async readNew(): Promise<void> {
    if (this.stopped) return;
    if (this.reading) {
      this.rereadPending = true;
      return;
    }
    this.reading = true;
    try {
      const stat = await fs.promises.stat(this.filePath);
      if (stat.size < this.offset) {
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
      out('ERROR', `tail read: ${String(err)}`);
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

let activeFolder: string | null = null;
let activeLogFile: string | null = null;
let activeTail: LogTail | null = null;
let activeFolderWatcher: FSWatcher | null = null;

function handleLine(line: string): void {
  // Sanity-anchor on the pipe-delimited Tarkov format so noisy non-log lines
  // (config dumps etc) don't blow up the INTEREST channel — but still let
  // parser hits through unconditionally.
  const parsed = parseLogLine(line);
  if (parsed) {
    out('MAP-CHANGE', `rawMapId=${parsed.rawMapId} | ${truncate(line)}`);
    return;
  }
  if (INTEREST_RE.test(line)) {
    out('INTEREST', truncate(line));
  }
}

async function attachToLogFile(filePath: string): Promise<void> {
  if (activeLogFile === filePath) return;
  if (activeTail) await activeTail.stop();
  activeLogFile = filePath;
  activeTail = new LogTail(filePath, handleLine);
  out('FS', `tailing ${path.basename(filePath)}`);
}

async function attachToSession(folder: string): Promise<void> {
  if (activeFolderWatcher) {
    await activeFolderWatcher.close();
    activeFolderWatcher = null;
  }
  if (activeTail) {
    await activeTail.stop();
    activeTail = null;
    activeLogFile = null;
  }
  activeFolder = folder;
  out('FS', `active session folder = ${path.basename(folder)}`);

  const picked = pickLatestApplicationLog(folder);
  if (picked) {
    await attachToLogFile(picked.file);
  } else {
    out('FS', `session folder is empty — waiting for application_NNN.log`);
  }

  activeFolderWatcher = chokidar.watch(folder, {
    ignoreInitial: true,
    persistent: true,
    depth: 0,
  });
  activeFolderWatcher.on('add', (filePath: string) => {
    const m = APPLICATION_LOG_RE.exec(path.basename(filePath));
    if (!m) return;
    const newSuffix = Number(m[1]);
    const currentMatch = activeLogFile
      ? APPLICATION_LOG_RE.exec(path.basename(activeLogFile))
      : null;
    const currentSuffix = currentMatch ? Number(currentMatch[1]) : -1;
    if (newSuffix > currentSuffix) {
      out('FS', `new log file in active folder: ${path.basename(filePath)} (suffix ${newSuffix})`);
      void attachToLogFile(filePath);
    }
  });
}

function onSessionFolderSeen(dir: string): void {
  const name = path.basename(dir);
  if (!name.startsWith(SESSION_FOLDER_PREFIX)) return;
  if (activeFolder && name <= path.basename(activeFolder)) return;
  out('FS', `new session folder detected: ${name}`);
  void attachToSession(dir);
}

async function main(): Promise<void> {
  out('INFO', `log-discovery started`);
  out('INFO', `logsDir = ${logsDir}`);
  if (!fs.existsSync(logsDir)) {
    out('ERROR', `logsDir does not exist — exit`);
    process.exit(1);
  }

  const folders = listSessionFolders(logsDir);
  out('INFO', `existing session folders: ${folders.length}`);
  if (folders.length > 0) {
    const latest = folders[folders.length - 1]!;
    out('INFO', `latest existing session: ${latest} (will tail from EOF — no historical replay)`);
    await attachToSession(path.join(logsDir, latest));
  } else {
    out('INFO', `no existing sessions; waiting for first launch`);
  }

  const root = chokidar.watch(logsDir, { ignoreInitial: true, persistent: true, depth: 0 });
  root.on('addDir', onSessionFolderSeen);
  root.on('error', (err: unknown) => out('ERROR', `root watcher: ${String(err)}`));

  const shutdown = async (): Promise<void> => {
    out('INFO', 'shutting down');
    if (activeTail) await activeTail.stop();
    if (activeFolderWatcher) await activeFolderWatcher.close();
    await root.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  out('INFO', 'ready — launch Tarkov when you like');
}

void main();
