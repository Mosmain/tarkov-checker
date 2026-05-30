/**
 * Helpers for parsing and building Tauri global-shortcut accelerator strings.
 *
 * Tauri/Electron accelerator format: `CommandOrControl+Alt+L`, parts joined
 * with `+`. The first parts are modifiers (any of CommandOrControl, Alt,
 * Shift, Meta, Super), the last part is the main key (letter A-Z, digit
 * 0-9, or function key F1-F24).
 */

/** Display labels for modifier parts, used by the Kbd components. */
const MODIFIER_DISPLAY: Readonly<Record<string, string>> = {
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Control: 'Ctrl',
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Option: 'Alt',
  Shift: 'Shift',
  Meta: 'Win',
  Super: 'Win',
  Cmd: 'Win',
  Command: 'Win',
};

/** Display labels for non-modifier main keys. Anything not listed falls back
 *  to an uppercased version of the token. */
const KEY_DISPLAY: Readonly<Record<string, string>> = {
  num0: 'Num 0',
  num1: 'Num 1',
  num2: 'Num 2',
  num3: 'Num 3',
  num4: 'Num 4',
  num5: 'Num 5',
  num6: 'Num 6',
  num7: 'Num 7',
  num8: 'Num 8',
  num9: 'Num 9',
  numadd: 'Num +',
  numsub: 'Num -',
  nummult: 'Num *',
  numdiv: 'Num /',
  numdec: 'Num .',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: '⌫',
  Delete: 'Del',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS']);

/**
 * Split an accelerator string into display-friendly parts (e.g. for rendering
 * inside `<kbd>` tags). Returns the input as-is if it doesn't look like a
 * valid combo.
 */
export function formatHotkeyParts(combo: string): readonly string[] {
  if (!combo) return [];
  const raw = combo.split('+');
  return raw.map((part, idx) => {
    if (idx < raw.length - 1) return MODIFIER_DISPLAY[part] ?? part;
    return KEY_DISPLAY[part] ?? part.toUpperCase();
  });
}

interface CaptureResult {
  /** The accelerator string in canonical Tauri format, or null while only
   *  modifiers are held (waiting for a main key). */
  combo: string | null;
  /** True when the user pressed Escape — caller should cancel recording. */
  cancelled: boolean;
  /** Reason the combo is invalid, or null if it's good. */
  error: 'no-modifier' | 'bad-main-key' | null;
}

/**
 * Translate a `keydown` event into an accelerator string. Used by the
 * settings recorder UI.
 */
export function captureHotkey(event: KeyboardEvent): CaptureResult {
  if (event.key === 'Escape') {
    return { combo: null, cancelled: true, error: null };
  }
  // Holding only modifiers — wait for the main key.
  if (MODIFIER_KEYS.has(event.key)) {
    return { combo: null, cancelled: false, error: null };
  }

  const mods: string[] = [];
  if (event.ctrlKey || event.metaKey) mods.push('CommandOrControl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');

  const mainKey = normalizeMainKey(event);
  if (!mainKey) {
    return { combo: null, cancelled: false, error: 'bad-main-key' };
  }

  // Every binding requires at least one modifier. Tarkov holds bare keys
  // (notably the whole F-row) at the DirectInput level, so Tauri's
  // RegisterHotKey can't reliably claim them while the game is focused.
  // Forcing a modifier sidesteps the conflict entirely.
  if (mods.length === 0) {
    return { combo: null, cancelled: false, error: 'no-modifier' };
  }

  return {
    combo: [...mods, mainKey].join('+'),
    cancelled: false,
    error: null,
  };
}

// `KeyboardEvent.code` → Tauri accelerator token for non-letter/digit/F keys.
const CODE_TO_ACCEL: Readonly<Record<string, string>> = {
  // Numpad digits
  Numpad0: 'num0',
  Numpad1: 'num1',
  Numpad2: 'num2',
  Numpad3: 'num3',
  Numpad4: 'num4',
  Numpad5: 'num5',
  Numpad6: 'num6',
  Numpad7: 'num7',
  Numpad8: 'num8',
  Numpad9: 'num9',
  // Numpad operators
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  NumpadEnter: 'Enter',
  // Punctuation (literal character tokens accepted by Tauri/Electron accel)
  Slash: '/',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  // Navigation / editing
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/** Map a KeyboardEvent to a Tauri-acceptable main-key token. */
function normalizeMainKey(event: KeyboardEvent): string | null {
  const code = event.code;
  // Letters: KeyA..KeyZ
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  // Digits: Digit0..Digit9
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  // Function keys: F1..F24
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  // Numpad / punctuation / navigation
  return CODE_TO_ACCEL[code] ?? null;
}
