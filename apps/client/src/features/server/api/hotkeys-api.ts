import { hotkeyConfigSchema, type HotkeyConfig, type HotkeyPatch } from '@shared/hotkeys-api';
import { callBackend } from './transport';

const parseConfig = (d: unknown): HotkeyConfig => hotkeyConfigSchema.parse(d);

/** GET the backend-owned hotkey combos (the source of truth). */
export function fetchHotkeys(): Promise<HotkeyConfig> {
  return callBackend({
    tauri: { cmd: 'get_hotkeys' },
    http: { method: 'GET', path: '/api/hotkeys' },
    parse: parseConfig,
  });
}

/** PUT a partial update; the backend (re)registers and returns the EFFECTIVE
 * config — a field whose combo couldn't be claimed comes back reverted. */
export function putHotkeys(patch: HotkeyPatch): Promise<HotkeyConfig> {
  return callBackend({
    tauri: { cmd: 'update_hotkeys', args: { patch } },
    http: { method: 'PUT', path: '/api/hotkeys', body: patch },
    parse: parseConfig,
  });
}

/** Release the OS binds while the settings recorder captures a combo, so the
 * keystroke reaches the page/webview instead of firing its action. */
export function suspendHotkeys(): Promise<void> {
  return callBackend({
    tauri: { cmd: 'suspend_hotkeys' },
    http: { method: 'POST', path: '/api/hotkeys/suspend' },
    parse: () => undefined,
  });
}

/** Re-claim the OS binds after the recorder finishes. */
export function resumeHotkeys(): Promise<void> {
  return callBackend({
    tauri: { cmd: 'resume_hotkeys' },
    http: { method: 'POST', path: '/api/hotkeys/resume' },
    parse: () => undefined,
  });
}
