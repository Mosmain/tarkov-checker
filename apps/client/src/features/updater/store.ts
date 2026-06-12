import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';
import { isTauri } from '@/shared/tauri';

/** Mirrors `UpdateInfo` in src-tauri/src/updater.rs (downloadUrl stays Rust-side). */
export interface UpdateInfo {
  current: string;
  latest: string;
  releaseUrl: string;
}

/** Outcome of the most recent check — drives the settings-footer button label. */
export type CheckOutcome = 'none' | 'latest' | 'error';

export const useUpdaterStore = defineStore('updater', () => {
  // When off, no check fires on startup; the manual button still works.
  const autoCheck = persistedRef('tc.updater.autoCheck', z.boolean(), true);

  // Runtime state, deliberately not persisted: a pending update is only as
  // fresh as the process that found it.
  const info = ref<UpdateInfo | null>(null);
  const checking = ref(false);
  const installing = ref(false);
  const installFailed = ref(false);
  const lastCheck = ref<CheckOutcome>('none');
  // Lives in the store (not the banner) so the tray's "update available"
  // item can un-dismiss the banner when restoring the window.
  const bannerDismissed = ref(false);

  async function check(): Promise<void> {
    if (!isTauri || checking.value) return;
    checking.value = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      info.value = await invoke<UpdateInfo | null>('check_update');
      lastCheck.value = info.value ? 'none' : 'latest';
    } catch (e) {
      console.warn('[updater] check failed:', e);
      lastCheck.value = 'error';
    } finally {
      checking.value = false;
    }
  }

  async function install(): Promise<void> {
    if (!isTauri || installing.value || !info.value) return;
    installing.value = true;
    installFailed.value = false;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // On success the backend swaps the exe, respawns it and exits this
      // process — there is no resolved state to handle.
      await invoke('install_update');
    } catch (e) {
      console.warn('[updater] install failed:', e);
      installFailed.value = true;
      installing.value = false;
    }
  }

  return {
    autoCheck,
    info,
    checking,
    installing,
    installFailed,
    lastCheck,
    bannerDismissed,
    check,
    install,
  };
});
