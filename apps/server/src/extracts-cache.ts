import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { mapExtracts, type MapExtracts } from "@tarkov-checker/shared";

const TARKOV_DEV_URL = "https://api.tarkov.dev/graphql";

const cacheEntrySchema = z.object({
  fetchedAt: z.number().int().nonnegative(),
  data: z.array(mapExtracts),
});
type CacheEntry = z.infer<typeof cacheEntrySchema>;

const cacheFileSchema = z.record(z.string(), cacheEntrySchema);
type CacheFile = z.infer<typeof cacheFileSchema>;

interface GraphQLResponse<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
}

const extractsResponseSchema = z.object({
  maps: z.array(mapExtracts),
});

export class ExtractsCache {
  private store: CacheFile = {};
  private inFlight = new Map<string, Promise<MapExtracts[]>>();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const text = await fs.readFile(this.filePath, "utf8");
      const parsed = cacheFileSchema.safeParse(JSON.parse(text));
      this.store = parsed.success ? parsed.data : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      this.store = {};
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.store, null, 2), "utf8");
  }

  /** Returns the cached entry for the given language, or null if no entry exists. */
  get(lang: string): CacheEntry | null {
    return this.store[lang] ?? null;
  }

  /**
   * Cache-first read. If the language is in the store, return it. Otherwise
   * fetch from tarkov.dev, store, and return. Concurrent calls for the same
   * language share one in-flight fetch.
   */
  async getOrFetch(lang: string): Promise<CacheEntry> {
    const hit = this.store[lang];
    if (hit) return hit;
    const data = await this.fetchAndStore(lang);
    return { fetchedAt: Date.now(), data }; // matches what fetchAndStore wrote
  }

  /** Force a network fetch and replace the cached entry. */
  async refresh(lang: string): Promise<CacheEntry> {
    const data = await this.fetchAndStore(lang);
    const entry = this.store[lang];
    if (!entry) {
      // fetchAndStore just wrote it; defensive fallback.
      return { fetchedAt: Date.now(), data };
    }
    return entry;
  }

  private async fetchAndStore(lang: string): Promise<MapExtracts[]> {
    const pending = this.inFlight.get(lang);
    if (pending) return pending;
    const promise = (async () => {
      const data = await this.fetchTarkovDev(lang);
      this.store[lang] = { fetchedAt: Date.now(), data };
      await this.persist();
      return data;
    })();
    this.inFlight.set(lang, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(lang);
    }
  }

  private async fetchTarkovDev(lang: string): Promise<MapExtracts[]> {
    const query = `{ maps(lang: ${lang}) { nameId name extracts { name faction position { x y z } } } }`;
    const response = await fetch(TARKOV_DEV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      throw new Error(`tarkov.dev API: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as GraphQLResponse<{ maps: unknown }>;
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(`tarkov.dev API: ${payload.errors.map((e) => e.message).join("; ")}`);
    }
    if (!payload.data) {
      throw new Error("tarkov.dev API: empty response");
    }
    return extractsResponseSchema.parse(payload.data).maps;
  }
}
