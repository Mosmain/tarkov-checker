import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface PathCandidate {
  readonly path: string;
  readonly exists: boolean;
  readonly source: string;
}

export interface WatcherPaths {
  logDir: string | null;
  screenshotDir: string | null;
  /** Every path considered for screenshots, in priority order. */
  screenshotCandidates: ReadonlyArray<PathCandidate>;
  /** Every path considered for logs, in priority order. */
  logCandidates: ReadonlyArray<PathCandidate>;
}

function exists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function logCandidates(): ReadonlyArray<PathCandidate> {
  const envOverride = process.env["TARKOV_LOG_DIR"];
  const localAppData = process.env["LOCALAPPDATA"];
  const home = os.homedir();
  const candidates: PathCandidate[] = [];

  if (envOverride) {
    candidates.push({ path: envOverride, exists: exists(envOverride), source: "TARKOV_LOG_DIR" });
  }
  if (localAppData) {
    const c = path.join(localAppData, "Battlestate Games", "EscapeFromTarkov", "Logs");
    candidates.push({ path: c, exists: exists(c), source: "LOCALAPPDATA" });
  }
  if (home) {
    const c = path.join(home, "AppData", "Local", "Battlestate Games", "EscapeFromTarkov", "Logs");
    candidates.push({ path: c, exists: exists(c), source: "homedir+AppData/Local" });
  }
  return candidates;
}

function screenshotCandidates(): ReadonlyArray<PathCandidate> {
  const envOverride = process.env["TARKOV_SCREENSHOT_DIR"];
  const oneDrive = process.env["OneDrive"];
  const home = os.homedir();
  const candidates: PathCandidate[] = [];

  if (envOverride) {
    candidates.push({
      path: envOverride,
      exists: exists(envOverride),
      source: "TARKOV_SCREENSHOT_DIR",
    });
  }
  if (oneDrive) {
    const c = path.join(oneDrive, "Documents", "Escape from Tarkov", "Screenshots");
    candidates.push({ path: c, exists: exists(c), source: "$OneDrive" });
  }
  if (home) {
    candidates.push({
      path: path.join(home, "OneDrive", "Documents", "Escape from Tarkov", "Screenshots"),
      exists: false,
      source: "homedir+OneDrive/Documents",
    });
    candidates.push({
      path: path.join(home, "Documents", "Escape from Tarkov", "Screenshots"),
      exists: false,
      source: "homedir+Documents",
    });
    candidates.push({
      path: path.join(home, "OneDrive - Personal", "Documents", "Escape from Tarkov", "Screenshots"),
      exists: false,
      source: "homedir+OneDrive - Personal/Documents",
    });
    candidates.push({
      path: path.join(home, "Escape from Tarkov", "Screenshots"),
      exists: false,
      source: "homedir+EFT/Screenshots",
    });
  }
  // Re-check exists for entries we marked false above (cheaper to recompute once).
  return candidates.map((c) => ({ ...c, exists: c.exists || exists(c.path) }));
}

export function resolveWatcherPaths(): WatcherPaths {
  const logC = logCandidates();
  const ssC = screenshotCandidates();
  const logDir = logC.find((c) => c.exists)?.path ?? null;
  const screenshotDir = ssC.find((c) => c.exists)?.path ?? null;
  return {
    logDir,
    screenshotDir,
    screenshotCandidates: ssC,
    logCandidates: logC,
  };
}

export function dirExists(dir: string | null): boolean {
  if (!dir) return false;
  return exists(dir);
}
