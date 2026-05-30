import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

// One or more modifiers + a non-empty main key. Bare keys (incl. F-row)
// are rejected because Tarkov claims them via DirectInput and Tauri's
// RegisterHotKey loses the race.
const hotkeySchema = z
  .string()
  .regex(/^((CommandOrControl|Control|Ctrl|Alt|Shift|Meta|Super)\+)+[^+\s]+$/);

export const useHotkeysStore = defineStore('hotkeys', () => {
  const lockHotkey = persistedRef('tc.hotkeys.lock', hotkeySchema, 'CommandOrControl+Alt+L');
  const zoomInHotkey = persistedRef('tc.hotkeys.zoomIn', hotkeySchema, 'CommandOrControl+=');
  const zoomOutHotkey = persistedRef('tc.hotkeys.zoomOut', hotkeySchema, 'CommandOrControl+-');
  const floorUpHotkey = persistedRef(
    'tc.hotkeys.floorUp',
    hotkeySchema,
    'CommandOrControl+Shift+=',
  );
  const floorDownHotkey = persistedRef(
    'tc.hotkeys.floorDown',
    hotkeySchema,
    'CommandOrControl+Shift+-',
  );
  // Hotkey only arms/clears at boundaries — sample capture is driven by
  // the screenshot-watcher's `position` events, not this binding.
  const airdropHotkey = persistedRef('tc.hotkeys.airdrop', hotkeySchema, 'CommandOrControl+Alt+D');

  return {
    lockHotkey,
    zoomInHotkey,
    zoomOutHotkey,
    floorUpHotkey,
    floorDownHotkey,
    airdropHotkey,
  };
});
