import { useConfirm } from 'primevue/useconfirm';
import { useTauriOverlay } from './useTauriOverlay';
import { useOverlayStore } from '@/features/overlay/store';

/**
 * Returns the overlay ✕-button handler. With "minimize to tray" enabled it
 * hides the window to the system tray (reversible — restore from the tray's
 * Show item), so no confirm is needed. Otherwise it pops a confirm dialog and
 * quits on accept. No-op in browser context (the ✕ is hidden there anyway).
 */
export function useCloseConfirm(): () => void {
  const confirm = useConfirm();
  const { t } = useI18n();
  const { isTauri } = useTauriOverlay();
  const { minimizeToTray } = storeToRefs(useOverlayStore());

  return function onCloseRequested(): void {
    if (!isTauri) return;

    if (minimizeToTray.value) {
      void (async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().hide();
      })();
      return;
    }

    confirm.require({
      message: t('closeConfirm.message'),
      header: t('closeConfirm.title'),
      icon: 'pi pi-times-circle',
      acceptLabel: t('closeConfirm.accept'),
      rejectLabel: t('closeConfirm.reject'),
      acceptClass: 'p-button-danger',
      accept: () => {
        void (async () => {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().close();
        })();
      },
    });
  };
}
