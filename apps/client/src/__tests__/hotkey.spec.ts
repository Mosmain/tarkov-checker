import { describe, it, expect } from 'vitest';
import { captureHotkey, formatHotkeyParts } from '@/features/hotkeys/lib/hotkey';

// Mirror of the keys accepted by global-hotkey 0.7.0's `parse_key` (uppercased
// before matching). Our captured main-key tokens MUST land in this set or
// Tauri's register() throws and the binding silently reverts (the Num- bug).
const CRATE_ACCEPTED = new Set<string>([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `KEY${l}`),
  ...'0123456789'.split(''),
  ...'0123456789'.split('').map((d) => `DIGIT${d}`),
  'BACKQUOTE', '`', 'BACKSLASH', '\\', 'BRACKETLEFT', '[', 'BRACKETRIGHT', ']',
  'COMMA', ',', 'EQUAL', '=', 'MINUS', '-', 'PERIOD', '.', 'QUOTE', "'",
  'SEMICOLON', ';', 'SLASH', '/',
  'SPACE', 'TAB', 'ENTER', 'BACKSPACE', 'DELETE', 'END', 'HOME', 'INSERT',
  'PAGEDOWN', 'PAGEUP',
  'ARROWDOWN', 'DOWN', 'ARROWLEFT', 'LEFT', 'ARROWRIGHT', 'RIGHT', 'ARROWUP', 'UP',
  'NUMPAD0', 'NUM0', 'NUMPAD1', 'NUM1', 'NUMPAD2', 'NUM2', 'NUMPAD3', 'NUM3',
  'NUMPAD4', 'NUM4', 'NUMPAD5', 'NUM5', 'NUMPAD6', 'NUM6', 'NUMPAD7', 'NUM7',
  'NUMPAD8', 'NUM8', 'NUMPAD9', 'NUM9',
  'NUMPADADD', 'NUMADD', 'NUMPADPLUS', 'NUMPLUS',
  'NUMPADSUBTRACT', 'NUMSUBTRACT',
  'NUMPADMULTIPLY', 'NUMMULTIPLY',
  'NUMPADDIVIDE', 'NUMDIVIDE',
  'NUMPADDECIMAL', 'NUMDECIMAL',
  'NUMPADENTER', 'NUMENTER', 'NUMPADEQUAL', 'NUMEQUAL',
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
]);

interface Mods {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  altGraph?: boolean;
}

function ev(code: string, mods: Mods = {}, key = ''): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    code,
    key,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
    modifierAltGraph: !!mods.altGraph,
  });
}

/** Last token of an accelerator string (the main key). */
function mainKey(combo: string): string {
  const parts = combo.split('+');
  return parts[parts.length - 1] ?? '';
}

describe('captureHotkey — main keys', () => {
  it('letters map KeyX → X', () => {
    expect(captureHotkey(ev('KeyL', { ctrl: true, alt: true })).combo).toBe('CommandOrControl+Alt+L');
  });

  it('digits map DigitN → N', () => {
    expect(captureHotkey(ev('Digit5', { ctrl: true })).combo).toBe('CommandOrControl+5');
  });

  it('function keys pass through', () => {
    expect(captureHotkey(ev('F7', { alt: true })).combo).toBe('Alt+F7');
  });

  it('main-row minus is "-"', () => {
    expect(captureHotkey(ev('Minus', { ctrl: true })).combo).toBe('CommandOrControl+-');
  });

  it('meta counts as CommandOrControl', () => {
    expect(captureHotkey(ev('KeyK', { meta: true })).combo).toBe('CommandOrControl+K');
  });
});

describe('captureHotkey — numpad (regression for the Num- bug)', () => {
  const NUMPAD_CODES = [
    'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
    'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
    'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal',
    'NumpadEnter',
  ];

  it('NumpadSubtract no longer collapses to "-"', () => {
    const combo = captureHotkey(ev('NumpadSubtract', { ctrl: true })).combo;
    expect(combo).toBe('CommandOrControl+NumpadSubtract');
    expect(mainKey(combo!)).not.toBe('-');
  });

  it('NumpadAdd keeps working', () => {
    expect(captureHotkey(ev('NumpadAdd', { ctrl: true })).combo).toBe('CommandOrControl+NumpadAdd');
  });

  it('every numpad token is accepted by the global-hotkey parser', () => {
    for (const code of NUMPAD_CODES) {
      const combo = captureHotkey(ev(code, { ctrl: true })).combo;
      expect(combo, `no combo for ${code}`).toBeTruthy();
      const token = mainKey(combo!).toUpperCase();
      expect(CRATE_ACCEPTED.has(token), `${code} → "${token}" rejected by crate`).toBe(true);
    }
  });
});

describe('captureHotkey — validation', () => {
  it('requires a modifier', () => {
    const r = captureHotkey(ev('KeyL'));
    expect(r.combo).toBeNull();
    expect(r.error).toBe('no-modifier');
  });

  it('Escape cancels recording', () => {
    const r = captureHotkey(ev('Escape', { ctrl: true }, 'Escape'));
    expect(r.cancelled).toBe(true);
  });

  it('holding only modifiers waits for a main key', () => {
    const r = captureHotkey(ev('ControlLeft', { ctrl: true }, 'Control'));
    expect(r.combo).toBeNull();
    expect(r.error).toBeNull();
  });

  it('right Alt as AltGraph waits, not "invalid"', () => {
    // AltGr layouts report key="AltGraph" (not in MODIFIER_KEYS) — the code match saves it.
    const r = captureHotkey(ev('AltRight', { ctrl: true, alt: true }, 'AltGraph'));
    expect(r.combo).toBeNull();
    expect(r.error).toBeNull();
  });

  it('right Alt as plain Alt waits', () => {
    const r = captureHotkey(ev('AltRight', { alt: true }, 'Alt'));
    expect(r.combo).toBeNull();
    expect(r.error).toBeNull();
  });

  it('right-modifier codes are never main keys', () => {
    for (const code of ['ShiftRight', 'ControlRight', 'MetaRight']) {
      expect(captureHotkey(ev(code, { shift: true })).error).toBeNull();
    }
  });

  it('AltGr + key maps to Ctrl+Alt (how Windows delivers it)', () => {
    // RU layout: AltGr reports key="AltGraph", altKey/ctrlKey flags unreliable.
    expect(captureHotkey(ev('KeyZ', { altGraph: true })).combo).toBe('CommandOrControl+Alt+Z');
  });

  it('unmapped keys are rejected', () => {
    const r = captureHotkey(ev('MediaSelect', { ctrl: true }));
    expect(r.error).toBe('bad-main-key');
  });
});

describe('formatHotkeyParts', () => {
  it('renders canonical numpad tokens', () => {
    expect(formatHotkeyParts('CommandOrControl+NumpadSubtract')).toEqual(['Ctrl', 'Num -']);
  });

  it('still renders legacy persisted tokens', () => {
    expect(formatHotkeyParts('CommandOrControl+numadd')).toEqual(['Ctrl', 'Num +']);
  });

  it('uppercases unknown main keys', () => {
    expect(formatHotkeyParts('Alt+F7')).toEqual(['Alt', 'F7']);
  });
});
