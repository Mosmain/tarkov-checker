import { HOTKEY_SUSPEND_EVENT, HOTKEY_RESUME_EVENT } from '../lib/hotkey';

/**
 * Register a Tauri global shortcut that mirrors a reactive combo string. On
 * mount we register the current combo; on every change the old combo is
 * unregistered and the new one registered. If the new combo can't be claimed
 * (busy, invalid), the store ref is reverted to the previous value so the UI
 * keeps showing the actually-active hotkey.
 *
 * While the settings recorder is capturing, every shortcut is suspended
 * (unregistered) so the OS doesn't fire an action and swallow the keystroke —
 * that's what lets you (re)bind a combo that's already taken, including itself.
 * Resume re-claims the current value, which also re-applies an unchanged record.
 *
 * In browser context all of this is a no-op so the same code lives in both.
 */
export function useGlobalShortcut(isTauri: boolean, combo: Ref<string>, action: () => void): void {
  let registered: string | null = null;
  // Prevents the watch from looping when we revert combo.value after a
  // failed registration.
  let suppressNext = false;
  // True while a recorder is capturing — hold no OS binding.
  let suspended = false;

  // Serialize register/unregister ops. The change-watch and the recorder's
  // resume can both fire a register for the same combo; without this they race,
  // double-register, one throws "already registered", and the watch's failure
  // path reverts the value the user just set.
  let opChain: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = opChain.then(task);
    opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function unregisterCurrent(): Promise<void> {
    return enqueue(async () => {
      if (!isTauri || !registered) return;
      const { unregister } = await import('@tauri-apps/plugin-global-shortcut');
      try {
        await unregister(registered);
      } catch {
        // Best-effort — the binding may already be gone.
      }
      registered = null;
    });
  }

  function tryRegister(next: string): Promise<boolean> {
    return enqueue(async () => {
      if (!isTauri || suspended) return false;
      // Already active (e.g. resume registered it just before this queued run).
      if (next === registered) return true;
      const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut');
      if (registered) {
        try {
          await unregister(registered);
        } catch {
          // Ignore — old binding may already be gone.
        }
        registered = null;
      }
      // Defensive: an HMR reload may have left an orphan registration on the
      // Rust side; clear it before our register call so the attempt sticks.
      try {
        await unregister(next);
      } catch {
        // Expected when the combo isn't registered.
      }
      try {
        await register(next, (e) => {
          // Plugin fires both "Pressed" and "Released" — trigger on Pressed only.
          if (e.state === 'Pressed') action();
        });
        registered = next;
        return true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[hotkey] failed to register', next, err);
        return false;
      }
    });
  }

  onMounted(() => {
    void tryRegister(combo.value);
  });

  // The recorder brackets capture with suspend/resume so the pressed combo
  // reaches the webview instead of firing its OS action.
  useEventListener(window, HOTKEY_SUSPEND_EVENT, () => {
    suspended = true;
    void unregisterCurrent();
  });
  useEventListener(window, HOTKEY_RESUME_EVENT, () => {
    suspended = false;
    void tryRegister(combo.value);
  });

  watch(combo, async (next, prev) => {
    if (suppressNext) {
      suppressNext = false;
      return;
    }
    // Recording in progress — resume will re-register the final value.
    if (suspended) return;
    const ok = await tryRegister(next);
    // Don't revert if the combo did end up registered (a concurrent resume won
    // the race) — only when it genuinely couldn't be claimed.
    if (!ok && prev && registered !== next) {
      suppressNext = true;
      combo.value = prev;
      await tryRegister(prev);
    }
  });

  onBeforeUnmount(() => {
    void unregisterCurrent();
  });
}
