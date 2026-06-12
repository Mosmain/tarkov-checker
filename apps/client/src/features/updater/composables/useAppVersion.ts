import { isTauri } from '@/shared/tauri';

/**
 * Current app version for display. Tauri: the overlay's own version via the
 * app API. Browser/phone: the helper's version from `GET /api/ping` — that's
 * the version that matters there, the page itself has no version of its own.
 * `null` while loading or when the helper is unreachable.
 */
export function useAppVersion(): Ref<string | null> {
  const version = ref<string | null>(null);

  onMounted(async () => {
    try {
      if (isTauri) {
        const { getVersion } = await import('@tauri-apps/api/app');
        version.value = await getVersion();
      } else {
        const res = await fetch('/api/ping');
        if (res.ok) version.value = ((await res.json()) as { version?: string }).version ?? null;
      }
    } catch {
      version.value = null;
    }
  });

  return version;
}
