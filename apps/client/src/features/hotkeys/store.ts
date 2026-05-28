import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

// Validates a Tauri global-shortcut accelerator string. Either:
//   * one+ modifier(s) followed by any non-empty main-key token, OR
//   * a bare F1..F24 key (allowed without modifiers — rarely used for typing).
// Other reserved system shortcuts aren't policed here — if register() rejects
// the combo the watcher surfaces the error and the previous shortcut stays.
const hotkeySchema = z
  .string()
  .regex(
    /^((CommandOrControl|Control|Ctrl|Alt|Shift|Meta|Super)\+)+[^+\s]+$|^F([1-9]|1[0-9]|2[0-4])$/,
  );

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

  return { lockHotkey, zoomInHotkey, zoomOutHotkey, floorUpHotkey, floorDownHotkey };
});
