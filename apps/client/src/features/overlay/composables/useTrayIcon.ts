import type { TrayIcon, TrayIconEvent } from '@tauri-apps/api/tray';
import type { Menu, CheckMenuItem } from '@tauri-apps/api/menu';
import { useOverlayStore } from '@/features/overlay/store';
import { useUpdaterStore } from '@/features/updater/store';

type TrayHandle = Awaited<ReturnType<typeof TrayIcon.new>>;

const TRAY_ID = 'raidmate-tray';

/**
 * Owns the Tauri system-tray icon lifecycle: creates the icon on mount,
 * rebuilds the menu when the UI language changes, keeps the checkmark items in
 * sync with their stores, and removes the icon on unmount. No-op in browser
 * context.
 *
 * The tray is the only control surface reachable while the game is fullscreen
 * (the overlay can be hidden or click-through-locked behind it), so the menu
 * holds window/session-level rescues and lifecycle only; map-layer settings
 * live on the LayerRail. Left-click restores the window (Windows convention);
 * right-click opens the menu. Since ✕ parks the overlay in the tray (see
 * overlay store `minimizeToTray`), "Quit" here is the canonical way to exit.
 */
export function useTrayIcon(isTauri: boolean, overlayClickThrough: Ref<boolean>): void {
  if (!isTauri) return;

  const { t, locale } = useI18n();
  const { alwaysOnTop, pairingModalOpen } = storeToRefs(useOverlayStore());
  const updaterStore = useUpdaterStore();
  const { info: updateInfo, bannerDismissed } = storeToRefs(updaterStore);

  let trayRef: TrayHandle | null = null;
  // Live references to the check items so external state changes (hotkey,
  // settings drawer, quick menu) can re-sync their checkmarks without
  // rebuilding the whole menu.
  let lockItem: CheckMenuItem | null = null;
  let aotItem: CheckMenuItem | null = null;

  async function showWindow(): Promise<void> {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.show();
      await win.unminimize();
      // A visible-but-covered window won't raise on setFocus() alone:
      // Windows' foreground lock lets SetForegroundWindow fail silently for
      // background processes. Pulse always-on-top to force the raise, then
      // restore the user's setting.
      await win.setAlwaysOnTop(true);
      await win.setFocus();
      if (!alwaysOnTop.value) await win.setAlwaysOnTop(false);
    } catch (err) {
      // Most likely a missing core:window:allow-* capability — surface it,
      // these rejections are otherwise invisible (see CLAUDE.md).
      // eslint-disable-next-line no-console
      console.error('[tray] showWindow failed:', err);
    }
  }

  async function copyLanUrl(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('copy_lan_url');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tray] copy LAN URL failed:', err);
    }
  }

  async function buildTrayMenu(): Promise<Menu> {
    // Snapshot every label BEFORE the first await: the locale can flip
    // mid-build (it's set asynchronously by the i18n store), and a build
    // interleaved with that flip produces a mixed-language menu.
    const labels = {
      lock: t('tray.lock'),
      show: t('tray.showWindow'),
      aot: t('tray.alwaysOnTop'),
      update: updateInfo.value
        ? t('tray.updateAvailable', { version: updateInfo.value.latest })
        : null,
      pair: t('tray.pairPhone'),
      copy: t('tray.copyUrl'),
      quit: t('tray.quit'),
      tooltip: t('tray.tooltip'),
    };

    const { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem } =
      await import('@tauri-apps/api/menu');
    const separator = () => PredefinedMenuItem.new({ item: 'Separator' });

    lockItem = await CheckMenuItem.new({
      id: 'toggle-lock',
      text: labels.lock,
      checked: overlayClickThrough.value,
      action: () => {
        overlayClickThrough.value = !overlayClickThrough.value;
      },
    });
    const showItem = await MenuItem.new({
      id: 'show',
      text: labels.show,
      action: () => void showWindow(),
    });
    aotItem = await CheckMenuItem.new({
      id: 'always-on-top',
      text: labels.aot,
      checked: alwaysOnTop.value,
      action: () => {
        alwaysOnTop.value = !alwaysOnTop.value;
      },
    });
    const pairItem = await MenuItem.new({
      id: 'pair-phone',
      text: labels.pair,
      action: () => {
        void showWindow();
        pairingModalOpen.value = true;
      },
    });
    const copyItem = await MenuItem.new({
      id: 'copy-url',
      text: labels.copy,
      action: () => void copyLanUrl(),
    });
    const quitItem = await MenuItem.new({
      id: 'quit',
      text: labels.quit,
      action: () =>
        void (async () => {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().close();
        })(),
    });

    // Shows the window + banner instead of installing: install respawns the
    // app — too destructive for a stray tray click.
    const updateItem = labels.update
      ? await MenuItem.new({
          id: 'update-available',
          text: labels.update,
          action: () => {
            bannerDismissed.value = false;
            void showWindow();
          },
        })
      : null;

    // Three groups: overlay-mode toggles / window presence / LAN sharing,
    // plus Quit at arm's length (irreversible among recoverables).
    return Menu.new({
      items: [
        lockItem,
        aotItem,
        await separator(),
        showItem,
        ...(updateItem ? [updateItem] : []),
        await separator(),
        pairItem,
        copyItem,
        await separator(),
        quitItem,
      ],
    });
  }

  // Left-click restores the overlay (Windows convention); the menu opens on
  // right-click. `showMenuOnLeftClick: false` routes left clicks here instead.
  function onTrayEvent(event: TrayIconEvent): void {
    if (event.type === 'Click' && event.button === 'Left' && event.buttonState === 'Up') {
      void showWindow();
    }
  }

  onMounted(async () => {
    try {
      const [{ TrayIcon }, { defaultWindowIcon }] = await Promise.all([
        import('@tauri-apps/api/tray'),
        import('@tauri-apps/api/app'),
      ]);
      const icon = await defaultWindowIcon();
      trayRef = await TrayIcon.new({
        id: TRAY_ID,
        icon: icon ?? undefined,
        menu: await buildTrayMenu(),
        tooltip: t('tray.tooltip'),
        showMenuOnLeftClick: false,
        action: onTrayEvent,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tray] creation failed:', err);
    }
  });

  // Keep checkmarks in sync when state is changed from anywhere else.
  watch(overlayClickThrough, (v) => void lockItem?.setChecked(v));
  watch(alwaysOnTop, (v) => void aotItem?.setChecked(v));

  // Full rebuild on language change AND when an update appears/clears —
  // the conditional "update available" item can't be toggled in place.
  // Watches the actual vue-i18n `locale` (what t() reads), NOT the store's
  // apiLang: the store applies apiLang to the locale asynchronously, so an
  // apiLang watcher races the flip — it both misses the startup apply (tray
  // builds before the persisted language lands, screenshot: RU app / EN tray)
  // and rebuilds too early on a switch.
  watch([locale, updateInfo], async () => {
    if (!trayRef) return;
    try {
      await trayRef.setMenu(await buildTrayMenu());
      await trayRef.setTooltip(t('tray.tooltip'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tray] menu refresh failed:', err);
    }
  });

  onBeforeUnmount(async () => {
    const { TrayIcon } = await import('@tauri-apps/api/tray');
    await TrayIcon.removeById(TRAY_ID);
    trayRef = null;
  });
}
