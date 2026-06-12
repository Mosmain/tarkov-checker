import type { TrayIcon, TrayIconEvent } from '@tauri-apps/api/tray';
import type { Menu, CheckMenuItem } from '@tauri-apps/api/menu';
import { useI18nStore } from '@/features/i18n/store';
import { useOverlayStore } from '@/features/overlay/store';
import { useMapSettingsStore } from '@/features/map/store';

type TrayHandle = Awaited<ReturnType<typeof TrayIcon.new>>;

const TRAY_ID = 'tarkov-checker-tray';

async function showWindow(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.show();
  await win.unminimize();
  await win.setFocus();
}

/**
 * Owns the Tauri system-tray icon lifecycle: creates the icon on mount,
 * rebuilds the menu when the UI language changes, keeps the checkmark items in
 * sync with their stores, and removes the icon on unmount. No-op in browser
 * context.
 *
 * The tray is the only control surface reachable while the game is fullscreen
 * (the overlay can be hidden or click-through-locked behind it), so the menu
 * leans on actions that matter mid-game: unlock, restore, the always-on-top /
 * player-follow toggles, and the LAN-share shortcuts. Left-click restores the
 * window (Windows convention); right-click opens the menu. Since ✕ now parks
 * the overlay in the tray (see overlay store `minimizeToTray`), "Quit" here is
 * the canonical way to actually exit.
 */
export function useTrayIcon(isTauri: boolean, overlayClickThrough: Ref<boolean>): void {
  if (!isTauri) return;

  const { t } = useI18n();
  const { apiLang } = storeToRefs(useI18nStore());
  const { alwaysOnTop, pairingModalOpen } = storeToRefs(useOverlayStore());
  const { playerFollow } = storeToRefs(useMapSettingsStore());

  let trayRef: TrayHandle | null = null;
  // Live references to the check items so external state changes (hotkey,
  // settings drawer, quick menu) can re-sync their checkmarks without
  // rebuilding the whole menu.
  let lockItem: CheckMenuItem | null = null;
  let aotItem: CheckMenuItem | null = null;
  let followItem: CheckMenuItem | null = null;

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
    const { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem } =
      await import('@tauri-apps/api/menu');
    const separator = () => PredefinedMenuItem.new({ item: 'Separator' });

    lockItem = await CheckMenuItem.new({
      id: 'toggle-lock',
      text: t('tray.lock'),
      checked: overlayClickThrough.value,
      action: () => {
        overlayClickThrough.value = !overlayClickThrough.value;
      },
    });
    const showItem = await MenuItem.new({
      id: 'show',
      text: t('tray.showWindow'),
      action: () => void showWindow(),
    });
    aotItem = await CheckMenuItem.new({
      id: 'always-on-top',
      text: t('tray.alwaysOnTop'),
      checked: alwaysOnTop.value,
      action: () => {
        alwaysOnTop.value = !alwaysOnTop.value;
      },
    });
    followItem = await CheckMenuItem.new({
      id: 'player-follow',
      text: t('tray.playerFollow'),
      checked: playerFollow.value === 'on',
      action: () => {
        playerFollow.value = playerFollow.value === 'on' ? 'off' : 'on';
      },
    });
    const pairItem = await MenuItem.new({
      id: 'pair-phone',
      text: t('tray.pairPhone'),
      action: () => {
        void showWindow();
        pairingModalOpen.value = true;
      },
    });
    const copyItem = await MenuItem.new({
      id: 'copy-url',
      text: t('tray.copyUrl'),
      action: () => void copyLanUrl(),
    });
    const quitItem = await MenuItem.new({
      id: 'quit',
      text: t('tray.quit'),
      action: () =>
        void (async () => {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().close();
        })(),
    });

    return Menu.new({
      items: [
        lockItem,
        await separator(),
        showItem,
        await separator(),
        aotItem,
        followItem,
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
  watch(playerFollow, (v) => void followItem?.setChecked(v === 'on'));

  watch(apiLang, async () => {
    if (!trayRef) return;
    try {
      await trayRef.setMenu(await buildTrayMenu());
      await trayRef.setTooltip(t('tray.tooltip'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tray] i18n refresh failed:', err);
    }
  });

  onBeforeUnmount(async () => {
    const { TrayIcon } = await import('@tauri-apps/api/tray');
    await TrayIcon.removeById(TRAY_ID);
    trayRef = null;
  });
}
