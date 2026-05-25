import { z } from "zod";
import { mapExtracts, type MapExtracts } from "@shared/tarkov-api";

const API_URL = "https://api.tarkov.dev/graphql";

export type ApiLang = "en" | "ru" | "de" | "fr" | "es" | "it" | "ja" | "pl" | "pt" | "zh";

interface GraphQLResponse<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
}

const extractsResponse = z.object({
  maps: z.array(mapExtracts),
});

const extractsCache = new Map<ApiLang, Promise<MapExtracts[]>>();

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

export async function fetchAllExtracts(lang: ApiLang = "en"): Promise<MapExtracts[]> {
  const cached = extractsCache.get(lang);
  if (cached) return cached;

  const promise = (async () => {
    const data = await gqlQuery<{ maps: unknown }>(
      `{ maps(lang: ${lang}) { nameId extracts { name faction position { x y z } } } }`,
    );
    const parsed = extractsResponse.parse(data);
    return parsed.maps;
  })();

  extractsCache.set(lang, promise);
  try {
    return await promise;
  } catch (err) {
    extractsCache.delete(lang);
    throw err;
  }
}

export async function fetchExtractsForMap(
  nameId: string,
  lang: ApiLang = "en",
): Promise<MapExtracts | null> {
  const all = await fetchAllExtracts(lang);
  const lowered = nameId.toLowerCase();
  return all.find((m) => m.nameId.toLowerCase() === lowered) ?? null;
}
