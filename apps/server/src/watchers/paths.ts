import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface WatcherPaths {
  logDir: string | null;
  screenshotDir: string | null;
}

function existing(candidates: ReadonlyArray<string>): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function defaultLogDir(): string | null {
  const localAppData = process.env["LOCALAPPDATA"];
  if (!localAppData) return null;
  const candidate = path.join(localAppData, "Battlestate Games", "EscapeFromTarkov", "Logs");
  return existing([candidate]) ?? candidate;
}

function defaultScreenshotDir(): string | null {
  const home = os.homedir();
  const oneDrive = process.env["OneDrive"];
  const candidates: string[] = [];
  if (oneDrive) {
    candidates.push(path.join(oneDrive, "Documents", "Escape from Tarkov", "Screenshots"));
  }
  if (home) {
    candidates.push(path.join(home, "OneDrive", "Documents", "Escape from Tarkov", "Screenshots"));
    candidates.push(path.join(home, "Documents", "Escape from Tarkov", "Screenshots"));
  }
  if (candidates.length === 0) return null;
  return existing(candidates) ?? candidates[0]!;
}

export function resolveWatcherPaths(): WatcherPaths {
  const logEnv = process.env["TARKOV_LOG_DIR"];
  const ssEnv = process.env["TARKOV_SCREENSHOT_DIR"];
  return {
    logDir: logEnv && logEnv.length > 0 ? logEnv : defaultLogDir(),
    screenshotDir: ssEnv && ssEnv.length > 0 ? ssEnv : defaultScreenshotDir(),
  };
}

export function dirExists(dir: string | null): boolean {
  if (!dir) return false;
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
