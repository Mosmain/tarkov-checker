import { z } from 'zod';
import { hotkeyActions, type HotkeyActionCode } from './sse-messages.js';

/**
 * Accelerator string in Tauri/Electron format: one or more modifiers + a
 * non-empty main key, e.g. `CommandOrControl+Alt+L`. Bare keys (incl. the
 * F-row) are rejected — Tarkov claims them via DirectInput and the OS
 * RegisterHotKey loses the race. Shared between the client recorder/store
 * and the backend `/api/hotkeys` validation so both ports agree.
 */
export const acceleratorSchema = z
  .string()
  .regex(/^((CommandOrControl|Control|Ctrl|Alt|Shift|Meta|Super)\+)+[^+\s]+$/);

/** The five backend-forwarded actions (re-exported from the wire enum so
 * there's one list to maintain). Lock is deliberately NOT here — it stays a
 * client-side overlay-only shortcut. */
export const hotkeyActionSchema = z.enum(hotkeyActions);

/** Full hotkey config the backend owns + persists in `hotkeys.json`. One
 * accelerator per action, camelCase keys matching the Rust `HotkeyConfig`. */
export const hotkeyConfigSchema = z.object({
  zoomIn: acceleratorSchema,
  zoomOut: acceleratorSchema,
  floorUp: acceleratorSchema,
  floorDown: acceleratorSchema,
  airdrop: acceleratorSchema,
});

/** PUT body — every field optional, only present keys are updated. */
export const hotkeyPatchSchema = hotkeyConfigSchema.partial();

export type HotkeyConfig = z.infer<typeof hotkeyConfigSchema>;
export type HotkeyPatch = z.infer<typeof hotkeyPatchSchema>;

/** Field name in `HotkeyConfig` ↔ wire action code. Used by the client to
 * map a settings field to the `command` action and back. */
export const HOTKEY_FIELD_TO_ACTION: Readonly<Record<keyof HotkeyConfig, HotkeyActionCode>> = {
  zoomIn: 'zoom-in',
  zoomOut: 'zoom-out',
  floorUp: 'floor-up',
  floorDown: 'floor-down',
  airdrop: 'airdrop',
};
