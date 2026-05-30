import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectDocumentsDir, detectTarkovGameDir } from './registry.js';

export type PathSource = 'env' | 'manual' | 'detected' | 'missing';

export interface ResolvedPath {
  /** Absolute path resolved for this slot, or null when nothing is known. */
  readonly value: string | null;
  /** Where the value came from. "missing" = no source produced anything. */
  readonly source: PathSource;
  /** Whether `value` points at an existing directory right now. */
  readonly exists: boolean;
}

export interface ResolvedPaths {
  readonly gameDir: ResolvedPath;
  readonly logsDir: ResolvedPath;
  readonly screenshotsDir: ResolvedPath;
}

export interface ManualOverrides {
  readonly gameDir?: string | null;
  readonly screenshotsDir?: string | null;
}

function exists(dir: string | null): boolean {
  if (!dir) return false;
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

function asResolved(value: string | null, source: PathSource): ResolvedPath {
  if (!value) return { value: null, source: 'missing', exists: false };
  return { value, source, exists: exists(value) };
}

/**
 * Source-of-truth priority: env override > manual override (config file) >
 * registry-detected default. Higher-priority sources only win when they
 * actually produce a non-empty value.
 */
export async function resolvePaths(manual: ManualOverrides = {}): Promise<ResolvedPaths> {
  const detectedGame = await detectTarkovGameDir();
  const detectedDocuments = await detectDocumentsDir();

  const gameEnv = readEnv('TARKOV_GAME_DIR');
  const gameManual = manual.gameDir?.trim() || null;
  const gameDir: ResolvedPath = gameEnv
    ? asResolved(gameEnv, 'env')
    : gameManual
      ? asResolved(gameManual, 'manual')
      : asResolved(detectedGame, 'detected');

  // Logs always live at `<gameDir>/Logs` — there's no separate override.
  // The source badge inherits from `gameDir` so the UI shows the same
  // origin (env/manual/detected) for both.
  const logsFromGame = gameDir.value ? path.join(gameDir.value, 'Logs') : null;
  const logsDir: ResolvedPath = asResolved(
    logsFromGame,
    logsFromGame ? gameDir.source : 'missing',
  );

  const screenshotsEnv = readEnv('TARKOV_SCREENSHOT_DIR');
  const screenshotsManual = manual.screenshotsDir?.trim() || null;
  const detectedScreenshots = detectedDocuments
    ? path.join(detectedDocuments, 'Escape from Tarkov', 'Screenshots')
    : null;
  const screenshotsDir: ResolvedPath = screenshotsEnv
    ? asResolved(screenshotsEnv, 'env')
    : screenshotsManual
      ? asResolved(screenshotsManual, 'manual')
      : asResolved(detectedScreenshots, 'detected');

  return { gameDir, logsDir, screenshotsDir };
}
