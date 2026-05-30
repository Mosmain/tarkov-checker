import type { ServerConfigResponse } from '@shared/config-api';
import { fetchServerConfig, putServerConfig } from '@/features/server/api/server-config';

export type PathSlot = 'gameDir' | 'screenshotsDir' | 'logsDir';

/**
 * Typed UI-state for path-API failures. `no-helper` is the common case
 * when the SPA runs in a browser (hosted or LAN-phone) and the user has
 * not started `tarkov-checker.exe` yet — the panel renders a friendly
 * "start the helper" message instead of the raw fetch error.
 */
export type PathsError =
  | { kind: 'no-helper' }
  | { kind: 'other'; detail: string };

export interface UseServerPaths {
  serverConfig: Ref<ServerConfigResponse | null>;
  gameDirInput: Ref<string>;
  screenshotsDirInput: Ref<string>;
  pathsLoading: Ref<boolean>;
  pathsSaving: Ref<boolean>;
  pathsError: Ref<PathsError | null>;
  pathsJustSaved: Ref<boolean>;
  gameDirLocked: ComputedRef<boolean>;
  screenshotsDirLocked: ComputedRef<boolean>;
  canSavePaths: ComputedRef<boolean>;
  savePaths: () => Promise<void>;
  statusIconClass: (slot: PathSlot) => string;
}

/**
 * Classify a thrown error as "the helper is not reachable" vs anything
 * else. Two paths into the same outcome:
 *  - direct fetch from the hosted page to `http://localhost:47474`:
 *    `fetch` itself throws a `TypeError` when connection is refused;
 *  - dev mode through Vite's proxy: upstream-unreachable surfaces as
 *    HTTP 502/503/504 from the proxy, which `transport.ts` rewraps as
 *    `Error("... HTTP 502 — ...")`. The helper itself doesn't emit
 *    these codes, so a 5xx with that family is the proxy's signal.
 */
function isNoHelperError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) return /HTTP 5(02|03|04)\b/.test(err.message);
  return false;
}

function toPathsError(err: unknown): PathsError {
  if (isNoHelperError(err)) return { kind: 'no-helper' };
  return {
    kind: 'other',
    detail: err instanceof Error ? err.message : String(err),
  };
}

// Module-level cache: server config is fetched once per session and reused
// across PathsSection remounts (PrimeVue Drawer uses v-if, so each settings
// open is a fresh mount). Save invalidates by replacing with the PUT
// response. External edits to the config file by Rust would only show after
// a page reload — acceptable: Tauri is the only writer besides this UI.
let cachedConfig: ServerConfigResponse | null = null;

/**
 * Owns the Tarkov-paths CRUD UX: load + save the server config, track
 * dirty/locked/can-save state, and translate folder-existence info into
 * status-icon classes for the IconField indicator.
 *
 * `canEditPaths` is passed in because the rule (mobile-disabled, Tauri-always-on)
 * is owned by the panel — the composable just respects it.
 */
export function useServerPaths(canEditPaths: Ref<boolean>): UseServerPaths {
  const serverConfig = ref<ServerConfigResponse | null>(null);
  const gameDirInput = ref('');
  const screenshotsDirInput = ref('');
  const pathsLoading = ref(false);
  const pathsSaving = ref(false);
  const pathsError = ref<PathsError | null>(null);
  const pathsJustSaved = ref(false);

  const gameDirLocked = computed(() => serverConfig.value?.gameDir.source === 'env');
  const screenshotsDirLocked = computed(() => serverConfig.value?.screenshotsDir.source === 'env');
  const gameDirDirty = computed(
    () => (serverConfig.value?.gameDir.value ?? '') !== gameDirInput.value,
  );
  const screenshotsDirDirty = computed(
    () => (serverConfig.value?.screenshotsDir.value ?? '') !== screenshotsDirInput.value,
  );
  const canSavePaths = computed(
    () =>
      canEditPaths.value && !pathsSaving.value && (gameDirDirty.value || screenshotsDirDirty.value),
  );

  function applyConfig(cfg: ServerConfigResponse): void {
    serverConfig.value = cfg;
    gameDirInput.value = cfg.gameDir.value ?? '';
    screenshotsDirInput.value = cfg.screenshotsDir.value ?? '';
  }

  async function loadPaths(): Promise<void> {
    if (cachedConfig) {
      applyConfig(cachedConfig);
      return;
    }
    pathsLoading.value = true;
    pathsError.value = null;
    try {
      const cfg = await fetchServerConfig();
      cachedConfig = cfg;
      applyConfig(cfg);
    } catch (err) {
      pathsError.value = toPathsError(err);
    } finally {
      pathsLoading.value = false;
    }
  }

  async function savePaths(): Promise<void> {
    if (!canSavePaths.value) return;
    pathsSaving.value = true;
    pathsError.value = null;
    try {
      const patch = {
        ...(gameDirLocked.value ? {} : { gameDir: gameDirInput.value.trim() || null }),
        ...(screenshotsDirLocked.value
          ? {}
          : { screenshotsDir: screenshotsDirInput.value.trim() || null }),
      };
      const cfg = await putServerConfig(patch);
      cachedConfig = cfg;
      applyConfig(cfg);
      pathsJustSaved.value = true;
      setTimeout(() => {
        pathsJustSaved.value = false;
      }, 2_000);
    } catch (err) {
      pathsError.value = toPathsError(err);
    } finally {
      pathsSaving.value = false;
    }
  }

  function statusIconClass(slot: PathSlot): string {
    const item = serverConfig.value?.[slot];
    if (!item) return 'pi pi-circle text-surface-500';
    if (item.exists) return 'pi pi-check-circle text-green-500';
    if (item.value) return 'pi pi-exclamation-circle text-amber-400';
    return 'pi pi-times-circle text-red-500';
  }

  onMounted(() => {
    void loadPaths();
  });

  return {
    serverConfig,
    gameDirInput,
    screenshotsDirInput,
    pathsLoading,
    pathsSaving,
    pathsError,
    pathsJustSaved,
    gameDirLocked,
    screenshotsDirLocked,
    canSavePaths,
    savePaths,
    statusIconClass,
  };
}
