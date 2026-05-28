import type { ServerConfigResponse } from "@shared/config-api";
import { fetchServerConfig, putServerConfig } from "../api/server-config";

export type PathSlot = "gameDir" | "screenshotsDir" | "logsDir";

export interface UseServerPaths {
  serverConfig: Ref<ServerConfigResponse | null>;
  gameDirInput: Ref<string>;
  screenshotsDirInput: Ref<string>;
  pathsLoading: Ref<boolean>;
  pathsSaving: Ref<boolean>;
  pathsError: Ref<string | null>;
  pathsJustSaved: Ref<boolean>;
  gameDirLocked: ComputedRef<boolean>;
  screenshotsDirLocked: ComputedRef<boolean>;
  canSavePaths: ComputedRef<boolean>;
  loadPaths: () => Promise<void>;
  savePaths: () => Promise<void>;
  statusIconClass: (slot: PathSlot) => string;
}

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
  const gameDirInput = ref("");
  const screenshotsDirInput = ref("");
  const pathsLoading = ref(false);
  const pathsSaving = ref(false);
  const pathsError = ref<string | null>(null);
  const pathsJustSaved = ref(false);

  const gameDirLocked = computed(() => serverConfig.value?.gameDir.source === "env");
  const screenshotsDirLocked = computed(
    () => serverConfig.value?.screenshotsDir.source === "env",
  );
  const gameDirDirty = computed(
    () => (serverConfig.value?.gameDir.value ?? "") !== gameDirInput.value,
  );
  const screenshotsDirDirty = computed(
    () => (serverConfig.value?.screenshotsDir.value ?? "") !== screenshotsDirInput.value,
  );
  const canSavePaths = computed(
    () =>
      canEditPaths.value &&
      !pathsSaving.value &&
      (gameDirDirty.value || screenshotsDirDirty.value),
  );

  function syncInputsFromConfig(cfg: ServerConfigResponse): void {
    gameDirInput.value = cfg.gameDir.value ?? "";
    screenshotsDirInput.value = cfg.screenshotsDir.value ?? "";
  }

  async function loadPaths(): Promise<void> {
    pathsLoading.value = true;
    pathsError.value = null;
    try {
      const cfg = await fetchServerConfig();
      serverConfig.value = cfg;
      syncInputsFromConfig(cfg);
    } catch (err) {
      pathsError.value = err instanceof Error ? err.message : String(err);
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
      serverConfig.value = cfg;
      syncInputsFromConfig(cfg);
      pathsJustSaved.value = true;
      setTimeout(() => {
        pathsJustSaved.value = false;
      }, 2_000);
    } catch (err) {
      pathsError.value = err instanceof Error ? err.message : String(err);
    } finally {
      pathsSaving.value = false;
    }
  }

  function statusIconClass(slot: PathSlot): string {
    const item = serverConfig.value?.[slot];
    if (!item) return "pi pi-circle text-surface-500";
    if (item.exists) return "pi pi-check-circle text-green-500";
    if (item.value) return "pi pi-exclamation-circle text-amber-400";
    return "pi pi-times-circle text-red-500";
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
    loadPaths,
    savePaths,
    statusIconClass,
  };
}
