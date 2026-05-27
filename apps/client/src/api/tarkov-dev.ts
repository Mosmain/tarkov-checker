import {
  extractsCacheResponse,
  type ExtractsCacheResponse,
  type MapExtracts,
} from "@shared/tarkov-api";

export type ApiLang = "en" | "ru" | "de" | "fr" | "es" | "it" | "ja" | "pl" | "pt" | "zh";

const isTauri = "__TAURI_INTERNALS__" in window;

function apiBase(): string {
  return `http://${window.location.hostname}:3000`;
}

const fetchedAtByLang = new Map<string, number>();
const inFlight = new Map<string, Promise<MapExtracts[]>>();

async function requestExtracts(lang: ApiLang, refresh: boolean): Promise<ExtractsCacheResponse> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<unknown>("get_extracts", { lang, refresh });
    return extractsCacheResponse.parse(data);
  }
  const params = new URLSearchParams({ lang });
  if (refresh) params.set("refresh", "1");
  const r = await fetch(`${apiBase()}/api/extracts?${params.toString()}`);
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => ({}));
    const detail =
      typeof body === "object" && body !== null && "error" in body ? body.error : body;
    throw new Error(`/api/extracts failed: HTTP ${r.status} — ${JSON.stringify(detail)}`);
  }
  return extractsCacheResponse.parse(await r.json());
}

/**
 * Cache-first read. The server holds the canonical cache; this client just
 * passes the language through. Concurrent calls share one HTTP round-trip.
 */
export async function fetchAllExtracts(lang: ApiLang = "en"): Promise<MapExtracts[]> {
  const pending = inFlight.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    const resp = await requestExtracts(lang, false);
    fetchedAtByLang.set(lang, resp.fetchedAt);
    return resp.data;
  })();
  inFlight.set(lang, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(lang);
  }
}

/** Force the server to re-fetch from tarkov.dev and update its cache. */
export async function refreshExtracts(lang: ApiLang): Promise<MapExtracts[]> {
  const resp = await requestExtracts(lang, true);
  fetchedAtByLang.set(lang, resp.fetchedAt);
  return resp.data;
}

export function getCacheTimestamp(lang: ApiLang): number | null {
  return fetchedAtByLang.get(lang) ?? null;
}

export async function fetchExtractsForMap(
  nameId: string,
  lang: ApiLang = "en",
): Promise<MapExtracts | null> {
  const all = await fetchAllExtracts(lang);
  const lowered = nameId.toLowerCase();
  return all.find((m) => m.nameId.toLowerCase() === lowered) ?? null;
}
