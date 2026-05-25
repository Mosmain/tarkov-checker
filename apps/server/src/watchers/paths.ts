import * as fs from "node:fs";

export interface WatcherPaths {
  logDir: string | null;
  screenshotDir: string | null;
}

function exists(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function readEnv(key: string): string | null {
  const v = process.env[key];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function resolveWatcherPaths(): WatcherPaths {
  return {
    logDir: readEnv("TARKOV_LOG_DIR"),
    screenshotDir: readEnv("TARKOV_SCREENSHOT_DIR"),
  };
}

export function dirExists(dir: string | null): boolean {
  if (!dir) return false;
  return exists(dir);
}
