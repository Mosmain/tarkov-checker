import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { ManualOverrides } from './watchers/paths.js';

const storedSchema = z.object({
  gameDir: z.string().nullable().optional(),
  screenshotsDir: z.string().nullable().optional(),
});

type Stored = z.infer<typeof storedSchema>;

export class ConfigStore {
  private state: Stored = {};

  constructor(private readonly filePath: string) {}

  /** Returns the directory the file lives in. */
  get dir(): string {
    return path.dirname(this.filePath);
  }

  /** Read the file from disk. Missing or malformed file → empty state. */
  async load(): Promise<void> {
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      const parsed = storedSchema.safeParse(JSON.parse(text));
      this.state = parsed.success ? parsed.data : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Unexpected read error — keep going with empty state but surface it.
        throw err;
      }
      this.state = {};
    }
  }

  /** Manual overrides in the shape resolvePaths() expects. */
  get overrides(): ManualOverrides {
    return {
      gameDir: this.state.gameDir ?? null,
      screenshotsDir: this.state.screenshotsDir ?? null,
    };
  }

  /** Merge update into stored state and persist. */
  async update(patch: Partial<Stored>): Promise<void> {
    const next: Stored = { ...this.state };
    if ('gameDir' in patch) next.gameDir = normalize(patch.gameDir);
    if ('screenshotsDir' in patch) next.screenshotsDir = normalize(patch.screenshotsDir);
    this.state = next;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }
}

function normalize(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
