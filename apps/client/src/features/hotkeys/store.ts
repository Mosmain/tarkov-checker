import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';
import { acceleratorSchema, type HotkeyConfig, type HotkeyPatch } from '@shared/hotkeys-api';
import { fetchHotkeys, putHotkeys } from '@/features/server/api/hotkeys-api';

// Default combos — must match the Rust `HotkeyConfig::default()` so an
// un-customised install agrees on both ends and the migration below is a no-op.
const DEFAULTS: HotkeyConfig = {
  zoomIn: 'CommandOrControl+=',
  zoomOut: 'CommandOrControl+-',
  floorUp: 'CommandOrControl+Shift+=',
  floorDown: 'CommandOrControl+Shift+-',
  airdrop: 'CommandOrControl+Alt+D',
};

// localStorage keys the old client-owned store used (per-field persistedRefs).
const LEGACY_KEYS: Record<keyof HotkeyConfig, string> = {
  zoomIn: 'tc.hotkeys.zoomIn',
  zoomOut: 'tc.hotkeys.zoomOut',
  floorUp: 'tc.hotkeys.floorUp',
  floorDown: 'tc.hotkeys.floorDown',
  airdrop: 'tc.hotkeys.airdrop',
};

/** Read a legacy persistedRef value (stored as JSON) and validate it. */
function readLegacy(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = acceleratorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Hotkey settings store. The overlay **lock** combo stays client-owned (it
 * toggles click-through — a window op, overlay-only — and is registered via
 * `tauri-plugin-global-shortcut`; see CLAUDE.md). The five forwarded actions
 * (zoom/floor/airdrop) are owned by the backend: this store is a thin sync
 * layer that loads them via `fetchHotkeys()` and PUTs on change. Local refs
 * start at the defaults so reads before `load()` are safe.
 */
export const useHotkeysStore = defineStore('hotkeys', () => {
  const lockHotkey = persistedRef('tc.hotkeys.lock', acceleratorSchema, 'CommandOrControl+Alt+L');

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

  // One-time migration: if the user customised combos in the old localStorage
  // store, push those up to the backend the first time the new client runs.
  // Defaults match, so an un-customised install never PUTs anything.
  const migrated = persistedRef('tc.hotkeys.migrated', z.boolean(), false);

  async function migrateLegacy(backend: HotkeyConfig): Promise<void> {
    if (migrated.value) return;
    migrated.value = true;
    const patch: HotkeyPatch = {};
    for (const key of Object.keys(LEGACY_KEYS) as (keyof HotkeyConfig)[]) {
      const legacy = readLegacy(LEGACY_KEYS[key]);
      if (legacy && legacy !== backend[key]) {
        patch[key] = legacy;
      }
    }
    if (Object.keys(patch).length > 0) {
      applyConfig(await putHotkeys(patch));
    }
  }

  /** Load combos from the backend and run the one-time legacy migration.
   * Mounted once at the app root (see `useHotkeysSync`). */
  async function load(): Promise<void> {
    const backend = await fetchHotkeys();
    applyConfig(backend);
    await migrateLegacy(backend);
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
