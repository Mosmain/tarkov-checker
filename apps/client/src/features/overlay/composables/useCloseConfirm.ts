import { useConfirm } from 'primevue/useconfirm';
import { useTauriOverlay } from './useTauriOverlay';

/**
 * Returns a `confirmClose()` function that pops a PrimeVue confirm dialog
 * and, on accept, closes the Tauri window. No-op in browser context (the
 * close button is hidden there anyway).
 */
export function useCloseConfirm(): () => void {
  const confirm = useConfirm();
  const { t } = useI18n();
  const { isTauri } = useTauriOverlay();

  return function confirmClose(): void {
    if (!isTauri) return;
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
