/**
 * Register a Tauri global shortcut that mirrors a reactive combo string. On
 * mount we register the current combo; on every change the old combo is
 * unregistered and the new one registered. If the new combo can't be claimed
 * (busy, invalid), the store ref is reverted to the previous value so the UI
 * keeps showing the actually-active hotkey.
 *
 * In browser context all of this is a no-op so the same code lives in both.
 */
export function useGlobalShortcut(
  isTauri: boolean,
  combo: Ref<string>,
  action: () => void,
): void {
  let registered: string | null = null;
  // Prevents the watch from looping when we revert combo.value after a
  // failed registration.
  let suppressNext = false;

  async function tryRegister(next: string): Promise<boolean> {
    if (!isTauri) return false;
    const { register, unregister } = await import(
      "@tauri-apps/plugin-global-shortcut"
    );
    if (registered) {
      try {
        await unregister(registered);
      } catch {
        // Ignore — old binding may already be gone if the plugin reset state.
      }
      registered = null;
    }
    // Defensive cleanup: an HMR reload may have left an orphan registration
    // on the Rust side (old JS instance never got to onBeforeUnmount). Try
    // to clear it before our new register call so the second attempt sticks.
    try {
      await unregister(next);
    } catch {
      // Expected when the combo isn't registered — that's fine.
    }
    try {
      await register(next, (e) => {
        // Plugin fires both "Pressed" and "Released" — trigger on Pressed only.
        if (e.state === "Pressed") action();
      });
      registered = next;
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[hotkey] failed to register", next, err);
      return false;
    }
  }

  onMounted(() => {
    void tryRegister(combo.value);
  });

  watch(combo, async (next, prev) => {
    if (suppressNext) {
      suppressNext = false;
      return;
    }
    const ok = await tryRegister(next);
    if (!ok && prev) {
      // Revert store value to the working combo so the UI doesn't lie.
      suppressNext = true;
      combo.value = prev;
      await tryRegister(prev);
    }
  });

  onBeforeUnmount(async () => {
    if (!isTauri || !registered) return;
    const { unregister } = await import("@tauri-apps/plugin-global-shortcut");
    try {
      await unregister(registered);
    } catch {
      // Ignore — best-effort cleanup.
    }
    registered = null;
  });
}
