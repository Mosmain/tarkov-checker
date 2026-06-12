import { persistedRef } from '@/shared/persisted-store';
import { acceleratorSchema, type HotkeyConfig } from '@shared/hotkeys-api';
import { fetchHotkeys, putHotkeys } from '@/features/server/api/hotkeys-api';

// Default combos — must match the Rust `HotkeyConfig::default()` so an
// un-customised install agrees on both ends.
const DEFAULTS: HotkeyConfig = {
  zoomIn: 'CommandOrControl+=',
  zoomOut: 'CommandOrControl+-',
  floorUp: 'CommandOrControl+Shift+=',
  floorDown: 'CommandOrControl+Shift+-',
  airdrop: 'CommandOrControl+Alt+D',
};

/**
 * Hotkey settings store. The overlay **lock** combo stays client-owned (it
 * toggles click-through — a window op, overlay-only — and is registered via
 * `tauri-plugin-global-shortcut`; see CLAUDE.md). The five forwarded actions
 * (zoom/floor/airdrop) are owned by the backend: this store is a thin sync
 * layer that loads them via `fetchHotkeys()` and PUTs on change. Local refs
 * start at the defaults so reads before `load()` are safe.
 */
export const useHotkeysStore = defineStore('hotkeys', () => {
  const lockHotkey = persistedRef('rm.hotkeys.lock', acceleratorSchema, 'CommandOrControl+Alt+L');

  const zoomInHotkey = ref<string>(DEFAULTS.zoomIn);
  const zoomOutHotkey = ref<string>(DEFAULTS.zoomOut);
  const floorUpHotkey = ref<string>(DEFAULTS.floorUp);
  const floorDownHotkey = ref<string>(DEFAULTS.floorDown);
  const airdropHotkey = ref<string>(DEFAULTS.airdrop);

  const fields: Record<keyof HotkeyConfig, Ref<string>> = {
    zoomIn: zoomInHotkey,
    zoomOut: zoomOutHotkey,
    floorUp: floorUpHotkey,
    floorDown: floorDownHotkey,
    airdrop: airdropHotkey,
  };

  function applyConfig(cfg: HotkeyConfig): void {
    for (const key of Object.keys(fields) as (keyof HotkeyConfig)[]) {
      fields[key].value = cfg[key];
    }
  }

  /** Load combos from the backend.
   * Mounted once at the app root (see `useHotkeysSync`). */
  async function load(): Promise<void> {
    applyConfig(await fetchHotkeys());
  }

  /** Persist a single action's combo. Optimistically updates the local ref,
   * then snaps to the backend's EFFECTIVE value (which reverts the field if
   * the combo couldn't be registered); reverts on a rejected PUT (e.g. 400). */
  async function setAction(field: keyof HotkeyConfig, combo: string): Promise<void> {
    const prev = fields[field].value;
    if (prev === combo) return;
    fields[field].value = combo;
    try {
      applyConfig(await putHotkeys({ [field]: combo }));
    } catch {
      fields[field].value = prev;
    }
  }

  return {
    lockHotkey,
    zoomInHotkey,
    zoomOutHotkey,
    floorUpHotkey,
    floorDownHotkey,
    airdropHotkey,
    load,
    setAction,
    applyConfig,
  };
});
