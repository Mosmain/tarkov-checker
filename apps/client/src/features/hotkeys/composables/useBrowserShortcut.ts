import { matchesAccelerator } from '../lib/hotkey';

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return (
    node.tagName === 'INPUT' ||
    node.tagName === 'TEXTAREA' ||
    node.tagName === 'SELECT' ||
    node.isContentEditable
  );
}

/**
 * Page-level counterpart to useGlobalShortcut: fires `action` when the combo
 * is pressed while the page is focused, so zoom / floor / airdrop work in a
 * plain browser or on a LAN phone where Tauri's global-shortcut plugin isn't
 * available. No-op under Tauri (the OS-level shortcut already handles it, so
 * this would double-fire). Ignores keystrokes typed into form fields, and
 * preventDefault on a match so app combos like Ctrl+= don't also zoom the page.
 */
export function useBrowserShortcut(isTauri: boolean, combo: Ref<string>, action: () => void): void {
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (isTauri || isTypingTarget(e.target)) return;
    if (matchesAccelerator(e, combo.value)) {
      e.preventDefault();
      action();
    }
  });
}
