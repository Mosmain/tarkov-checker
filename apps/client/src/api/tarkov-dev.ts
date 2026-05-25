import { z } from "zod";
import { mapExtracts, type MapExtracts } from "@shared/tarkov-api";

const API_URL = "https://api.tarkov.dev/graphql";
const CACHE_KEY = "tarkov-checker:tarkov-dev-cache:v1";

export type ApiLang = "en" | "ru" | "de" | "fr" | "es" | "it" | "ja" | "pl" | "pt" | "zh";

interface GraphQLResponse<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
}

const extractsResponse = z.object({
  maps: z.array(mapExtracts),
});

const cacheEntrySchema = z.object({
  data: z.array(mapExtracts),
  fetchedAt: z.number().int().nonnegative(),
});

const cacheStoreSchema = z.record(z.string(), cacheEntrySchema);
type CacheStore = z.infer<typeof cacheStoreSchema>;

const inFlight = new Map<ApiLang, Promise<MapExtracts[]>>();

function readStore(): CacheStore {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = cacheStoreSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or storage disabled — silently keep in-memory only.
  }
}

async function gqlQuery<T>(query: string): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`tarkov.dev API: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`tarkov.dev API: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  if (!payload.data) {
    throw new Error("tarkov.dev API: empty response");
  }
  return payload.data;
}

async function fetchFresh(lang: ApiLang): Promise<MapExtracts[]> {
  const data = await gqlQuery<{ maps: unknown }>(
    `{ maps(lang: ${lang}) { nameId name extracts { name faction position { x y z } } } }`,
  );
  return extractsResponse.parse(data).maps;
}

/**
 * Cache-first: if the requested language is in localStorage, return it
 * without a network round-trip. Otherwise fetch, persist, and return.
 * tarkov.dev gets blocked by some ISPs (RU especially), so a stable
 * offline copy is valuable.
 */
export async function fetchAllExtracts(lang: ApiLang = "en"): Promise<MapExtracts[]> {
  const store = readStore();
  const hit = store[lang];
  if (hit) return hit.data;

  const pending = inFlight.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    const data = await fetchFresh(lang);
    const next = readStore();
    next[lang] = { data, fetchedAt: Date.now() };
    writeStore(next);
    return data;
  })();
  inFlight.set(lang, promise);
  try {
    return await promise;
  } catch (err) {
    inFlight.delete(lang);
    throw err;
  }
}

/**
 * Force a network fetch for the given language and replace the cache entry
 * even if a previous one was present. Returns the freshly fetched data.
 */
export async function refreshExtracts(lang: ApiLang): Promise<MapExtracts[]> {
  const promise = (async () => {
    const data = await fetchFresh(lang);
    const next = readStore();
    next[lang] = { data, fetchedAt: Date.now() };
    writeStore(next);
    return data;
  })();
  inFlight.set(lang, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(lang);
  }
}

export function getCacheTimestamp(lang: ApiLang): number | null {
  return readStore()[lang]?.fetchedAt ?? null;
}

export async function fetchExtractsForMap(
  nameId: string,
  lang: ApiLang = "en",
): Promise<MapExtracts | null> {
  const all = await fetchAllExtracts(lang);
  const lowered = nameId.toLowerCase();
  return all.find((m) => m.nameId.toLowerCase() === lowered) ?? null;
}
