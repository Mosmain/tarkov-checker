/**
 * Standalone discovery + verification harness for the Tarkov log pipeline.
 * Not wired into the server — runs by hand:
 *
 *   pnpm exec tsx apps/server/scripts/log-discovery.ts [logsDir]
 *
 * Tails three log files inside the latest `log_<ts>` session folder and
 * emits one structured stdout line per interesting event:
 *
 *   `application_NNN.log`:
 *     [MAP-CHANGE] — `parseLogLine` from @shared returned a hit (the line a
 *                    prod watcher would broadcast as a `map-change` SSE event).
 *     [INTEREST]   — broader keyword set (raid/match/transit/exit/survived
 *                    /killed/mia/extracted/GameStarted/LocationLoaded/...).
 *                    Captures lines we don't parse today — used to surface
 *                    new signals as BSG ships patches.
 *
 *   `aiData_NNN.log`:
 *     [BOSS]       — `Bot_N (bossXxx changed to <ZONE> patrol)` — discovered
 *                    2026-05-30, sole reliable boss-spawn signal we've found.
 *
 *   `network-connection_NNN.log`:
 *     [CONNECT]    — `Connect (address: <ip>:<port>)` — raid server attached.
 *     [STATS]      — `Statistics (... rtt: <ms>, lose: <frac>, sent: N,
 *                    received: N)` — fires alongside Disconnect; carries
 *                    per-raid network quality metrics.
 *     [DISCONNECT] — `Disconnect (address: ..., reason: N)` — raid ended;
 *                    higher-fidelity end signal than `BEClient exit` in the
 *                    application log.
 *
 *   Folder lifecycle (all files):
 *     [FS]         — new session folder appeared, new tail target picked.
 *     [INFO]       — startup / shutdown banners.
 *     [ERROR]      — watcher/read failures.
 *
 * The script tails three files in parallel within the same session folder and
 * re-attaches automatically when a new session folder appears (next game
 * launch). Lives next to the server so it shares `@tarkov-checker/shared`,
 * chokidar, and tsx out of the box.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { parseLogLine } from '@tarkov-checker/shared';

const DEFAULT_LOGS_DIR = 'D:\\EFT\\Logs';
const SESSION_FOLDER_PREFIX = 'log_';

// Per-file-kind filename matchers — Tarkov's `<session> <kind>_NNN.log`
// pattern. The leading `.+ ` swallows the session-stamp prefix; the capture
// group is the rotation suffix so we can pick the highest one.
const FILE_KINDS = {
  application: /^.+ application_(\d+)\.log$/,
  aiData: /^.+ aiData_(\d+)\.log$/,
  networkConnection: /^.+ network-connection_(\d+)\.log$/,
} as const;
type FileKind = keyof typeof FILE_KINDS;

const INTEREST_RE =
  /\b(raid|match|matching|transit|exit|exfil|survived|killed|mia|extracted|gamestarted|locationloaded|matchingcompleted|disconnect|raidresult|raidfinished|raidend|endraid|gameended|playerprofile|profile\s*status)\b/i;

// Boss-spawn line: e.g. `Bot_4 (bossTagilla changed to RESERV patrol)`.
const BOSS_RE = /\bBot_\d+ \((boss\w+) changed to (\w+) patrol\)/;

// Network-connection event shapes. Whitespace between fields is consistent
// in samples but we use `\s*` defensively in case BSG reformats.
const CONNECT_RE = /\bConnect \(address:\s*([\d.]+):(\d+)\)/;
const DISCONNECT_RE = /\bDisconnect \(address:\s*([\d.]+):(\d+)(?:,\s*reason:\s*(\d+))?\)/;
// `lose` can be `0`, plain float, or scientific (`5.820766E-11`).
const STATISTICS_RE =
  /\bStatistics \(address:\s*([\d.]+):(\d+),\s*rtt:\s*([\d.eE+-]+),\s*lose:\s*([\d.eE+-]+),\s*sent:\s*(\d+),\s*received:\s*(\d+)\)/;

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

function pickLatestFileOfKind(
  folder: string,
  kind: FileKind,
): { file: string; suffix: number } | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  const re = FILE_KINDS[kind];
  let best: { file: string; suffix: number } | null = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = re.exec(e.name);
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

function handleApplicationLine(line: string): void {
  const parsed = parseLogLine(line);
  if (parsed) {
    out('MAP-CHANGE', `rawMapId=${parsed.rawMapId} | ${truncate(line)}`);
    return;
  }
  if (INTEREST_RE.test(line)) {
    out('INTEREST', truncate(line));
  }
}

function handleAiDataLine(line: string): void {
  const m = BOSS_RE.exec(line);
  if (m) {
    out('BOSS', `boss=${m[1]} zone=${m[2]} | ${truncate(line)}`);
  }
  // Other aiData lines (Door without link, OnWeaponTaken stack traces, bot
  // creation logs) are intentionally dropped — too noisy and not actionable.
}

function handleNetworkConnectionLine(line: string): void {
  let m = CONNECT_RE.exec(line);
  if (m) {
    out('CONNECT', `server=${m[1]}:${m[2]}`);
    return;
  }
  m = STATISTICS_RE.exec(line);
  if (m) {
    out(
      'STATS',
      `server=${m[1]}:${m[2]} rtt=${m[3]}ms lose=${m[4]} sent=${m[5]} received=${m[6]}`,
    );
    return;
  }
  m = DISCONNECT_RE.exec(line);
  if (m) {
    const reason = m[3] ?? 'unspecified';
    out('DISCONNECT', `server=${m[1]}:${m[2]} reason=${reason}`);
  }
}

const FILE_HANDLERS: Record<FileKind, (line: string) => void> = {
  application: handleApplicationLine,
  aiData: handleAiDataLine,
  networkConnection: handleNetworkConnectionLine,
};

interface ActiveFile {
  kind: FileKind;
  file: string;
  suffix: number;
  tail: LogTail;
}

let activeFolder: string | null = null;
const activeFiles = new Map<FileKind, ActiveFile>();
let activeFolderWatcher: FSWatcher | null = null;

async function attachToFile(kind: FileKind, file: string, suffix: number): Promise<void> {
  const existing = activeFiles.get(kind);
  if (existing?.file === file) return;
  if (existing) await existing.tail.stop();
  const tail = new LogTail(file, FILE_HANDLERS[kind]);
  activeFiles.set(kind, { kind, file, suffix, tail });
  out('FS', `tailing ${path.basename(file)} (${kind})`);
}

async function detachAllFiles(): Promise<void> {
  await Promise.all(Array.from(activeFiles.values()).map((f) => f.tail.stop()));
  activeFiles.clear();
}

async function attachToSession(folder: string): Promise<void> {
  if (activeFolderWatcher) {
    await activeFolderWatcher.close();
    activeFolderWatcher = null;
  }
  await detachAllFiles();
  activeFolder = folder;
  out('FS', `active session folder = ${path.basename(folder)}`);

  const kinds = Object.keys(FILE_KINDS) as FileKind[];
  for (const kind of kinds) {
    const picked = pickLatestFileOfKind(folder, kind);
    if (picked) {
      await attachToFile(kind, picked.file, picked.suffix);
    } else {
      out('FS', `session has no ${kind} log yet — will pick up on file creation`);
    }
  }

  activeFolderWatcher = chokidar.watch(folder, {
    ignoreInitial: true,
    persistent: true,
    depth: 0,
  });
  activeFolderWatcher.on('add', (filePath: string) => {
    const base = path.basename(filePath);
    for (const kind of kinds) {
      const m = FILE_KINDS[kind].exec(base);
      if (!m) continue;
      const newSuffix = Number(m[1]);
      const existing = activeFiles.get(kind);
      if (existing && newSuffix <= existing.suffix) return;
      out('FS', `new ${kind} log: ${base} (suffix ${newSuffix})`);
      void attachToFile(kind, filePath, newSuffix);
      return;
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
    out('INFO', `latest existing session: ${latest} (tailing from EOF — no historical replay)`);
    await attachToSession(path.join(logsDir, latest));
  } else {
    out('INFO', `no existing sessions; waiting for first launch`);
  }

  const root = chokidar.watch(logsDir, { ignoreInitial: true, persistent: true, depth: 0 });
  root.on('addDir', onSessionFolderSeen);
  root.on('error', (err: unknown) => out('ERROR', `root watcher: ${String(err)}`));

  const shutdown = async (): Promise<void> => {
    out('INFO', 'shutting down');
    await detachAllFiles();
    if (activeFolderWatcher) await activeFolderWatcher.close();
    await root.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  out('INFO', 'ready — launch Tarkov when you like');
}

void main();
