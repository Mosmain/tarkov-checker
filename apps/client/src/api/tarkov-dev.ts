import { z } from "zod";
import { mapExtracts, type MapExtracts } from "@shared/tarkov-api";

const API_URL = "https://api.tarkov.dev/graphql";

interface GraphQLResponse<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
}

const extractsResponse = z.object({
  maps: z.array(mapExtracts),
});

const cache = new Map<string, Promise<MapExtracts[]>>();

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

export async function fetchAllExtracts(): Promise<MapExtracts[]> {
  const cacheKey = "all-extracts";
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const data = await gqlQuery<{ maps: unknown }>(
      `{ maps(lang: en) { nameId extracts { name faction position { x y z } } } }`,
    );
    const parsed = extractsResponse.parse(data);
    return parsed.maps;
  })();

  cache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(cacheKey);
    throw err;
  }
}

export async function fetchExtractsForMap(nameId: string): Promise<MapExtracts | null> {
  const all = await fetchAllExtracts();
  const lowered = nameId.toLowerCase();
  return all.find((m) => m.nameId.toLowerCase() === lowered) ?? null;
}
