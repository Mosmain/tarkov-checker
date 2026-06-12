import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { HotkeyConfig } from '@shared/hotkeys-api';

// Mock the transport layer the store syncs through. Hoisted so the vi.mock
// factory can reference the fns.
const { fetchHotkeysMock, putHotkeysMock } = vi.hoisted(() => ({
  fetchHotkeysMock: vi.fn(),
  putHotkeysMock: vi.fn(),
}));

vi.mock('@/features/server/api/hotkeys-api', () => ({
  fetchHotkeys: fetchHotkeysMock,
  putHotkeys: putHotkeysMock,
  suspendHotkeys: vi.fn(),
  resumeHotkeys: vi.fn(),
}));

import { useHotkeysStore } from '@/features/hotkeys/store';

const DEFAULTS: HotkeyConfig = {
  zoomIn: 'CommandOrControl+=',
  zoomOut: 'CommandOrControl+-',
  floorUp: 'CommandOrControl+Shift+=',
  floorDown: 'CommandOrControl+Shift+-',
  airdrop: 'CommandOrControl+Alt+D',
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  fetchHotkeysMock.mockReset();
  putHotkeysMock.mockReset();
});

describe('useHotkeysStore — backend sync', () => {
  it('starts at defaults before load()', () => {
    const store = useHotkeysStore();
    expect(store.zoomInHotkey).toBe(DEFAULTS.zoomIn);
    expect(store.airdropHotkey).toBe(DEFAULTS.airdrop);
  });

  it('load() applies the backend config', async () => {
    fetchHotkeysMock.mockResolvedValue({ ...DEFAULTS, zoomIn: 'CommandOrControl+Alt+Z' });
    const store = useHotkeysStore();
    await store.load();
    expect(store.zoomInHotkey).toBe('CommandOrControl+Alt+Z');
  });

  it('setAction PUTs and applies the effective response', async () => {
    fetchHotkeysMock.mockResolvedValue(DEFAULTS);
    putHotkeysMock.mockResolvedValue({ ...DEFAULTS, airdrop: 'CommandOrControl+Alt+X' });
    const store = useHotkeysStore();
    await store.load();

    await store.setAction('airdrop', 'CommandOrControl+Alt+X');
    expect(putHotkeysMock).toHaveBeenCalledWith({ airdrop: 'CommandOrControl+Alt+X' });
    expect(store.airdropHotkey).toBe('CommandOrControl+Alt+X');
  });

  it('setAction reverts the optimistic value when the PUT rejects', async () => {
    fetchHotkeysMock.mockResolvedValue(DEFAULTS);
    putHotkeysMock.mockRejectedValue(new Error('HTTP 400'));
    const store = useHotkeysStore();
    await store.load();

    await store.setAction('zoomIn', 'CommandOrControl+Alt+Q');
    expect(store.zoomInHotkey).toBe(DEFAULTS.zoomIn); // reverted
  });

  it('migrates a customised legacy localStorage combo once', async () => {
    // Old per-field persistedRef stored JSON-encoded strings.
    localStorage.setItem('tc.hotkeys.zoomIn', JSON.stringify('CommandOrControl+Alt+M'));
    fetchHotkeysMock.mockResolvedValue(DEFAULTS);
    putHotkeysMock.mockResolvedValue({ ...DEFAULTS, zoomIn: 'CommandOrControl+Alt+M' });

    const store = useHotkeysStore();
    await store.load();

    expect(putHotkeysMock).toHaveBeenCalledWith({ zoomIn: 'CommandOrControl+Alt+M' });
    expect(store.zoomInHotkey).toBe('CommandOrControl+Alt+M');
  });

  it('does not migrate when legacy values equal the backend defaults', async () => {
    localStorage.setItem('tc.hotkeys.zoomIn', JSON.stringify(DEFAULTS.zoomIn));
    fetchHotkeysMock.mockResolvedValue(DEFAULTS);

    const store = useHotkeysStore();
    await store.load();

    expect(putHotkeysMock).not.toHaveBeenCalled();
  });
});
