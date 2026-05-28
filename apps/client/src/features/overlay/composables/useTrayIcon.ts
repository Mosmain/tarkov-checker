import { useI18nStore } from "../../i18n/store";

type TrayHandle = Awaited<ReturnType<typeof import("@tauri-apps/api/tray").TrayIcon.new>>;

const TRAY_ID = "tarkov-checker-tray";

/**
 * Owns the Tauri system-tray icon lifecycle: creates the icon on mount,
 * rebuilds the menu when the UI language changes, and removes the icon on
 * unmount. No-op in browser context.
 */
export function useTrayIcon(isTauri: boolean, overlayClickThrough: Ref<boolean>): void {
  if (!isTauri) return;

  const { t } = useI18n();
  const { apiLang } = storeToRefs(useI18nStore());
  let trayRef: TrayHandle | null = null;

  async function buildTrayMenu(): Promise<
    Awaited<ReturnType<typeof import("@tauri-apps/api/menu").Menu.new>>
  > {
    const [{ Menu }, { getCurrentWindow }] = await Promise.all([
      import("@tauri-apps/api/menu"),
      import("@tauri-apps/api/window"),
    ]);
    return Menu.new({
      items: [
        {
          id: "toggle-lock",
          text: t("tray.toggleLock"),
          action: () => {
            overlayClickThrough.value = !overlayClickThrough.value;
          },
        },
        {
          id: "show",
          text: t("tray.showWindow"),
          action: async () => {
            const win = getCurrentWindow();
            await win.show();
            await win.setFocus();
          },
        },
        { item: "Separator" },
        {
          id: "quit",
          text: t("tray.quit"),
          action: async () => {
            await getCurrentWindow().close();
          },
        },
      ],
    });
  }

  onMounted(async () => {
    try {
      const [{ TrayIcon }, { defaultWindowIcon }] = await Promise.all([
        import("@tauri-apps/api/tray"),
        import("@tauri-apps/api/app"),
      ]);
      const icon = await defaultWindowIcon();
      trayRef = await TrayIcon.new({
        id: TRAY_ID,
        icon: icon ?? undefined,
        menu: await buildTrayMenu(),
        tooltip: t("tray.tooltip"),
        showMenuOnLeftClick: true,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[tray] creation failed:", err);
    }
  });

  watch(apiLang, async () => {
    if (!trayRef) return;
    try {
      await trayRef.setMenu(await buildTrayMenu());
      await trayRef.setTooltip(t("tray.tooltip"));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[tray] i18n refresh failed:", err);
    }
  });

  onBeforeUnmount(async () => {
    const { TrayIcon } = await import("@tauri-apps/api/tray");
    await TrayIcon.removeById(TRAY_ID);
    trayRef = null;
  });
}
