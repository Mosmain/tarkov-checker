import { useConfirm } from "primevue/useconfirm";
import { useUiText } from "../i18n";
import { useTauriOverlay } from "./useTauriOverlay";

/**
 * Returns a `confirmClose()` function that pops a PrimeVue confirm dialog
 * and, on accept, closes the Tauri window. No-op in browser context (the
 * close button is hidden there anyway).
 */
export function useCloseConfirm(): () => void {
  const confirm = useConfirm();
  const t = useUiText();
  const { isTauri } = useTauriOverlay();

  return function confirmClose(): void {
    if (!isTauri) return;
    confirm.require({
      message: t.value.closeConfirm.message,
      header: t.value.closeConfirm.title,
      icon: "pi pi-times-circle",
      acceptLabel: t.value.closeConfirm.accept,
      rejectLabel: t.value.closeConfirm.reject,
      acceptClass: "p-button-danger",
      accept: () => {
        void (async () => {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().close();
        })();
      },
    });
  };
}
