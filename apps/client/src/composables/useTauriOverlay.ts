/**
 * Tauri overlay-window controls. No-ops when running in the browser, so the
 * same component code works in both contexts.
 */

interface OverlayApi {
  readonly isTauri: boolean;
  setAlwaysOnTop: (on: boolean) => Promise<void>;
  setClickThrough: (on: boolean) => Promise<void>;
  setOpacity: (value: number) => Promise<void>;
  setZoom: (factor: number) => Promise<void>;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let cachedApi: OverlayApi | null = null;

async function loadTauriWindow(): Promise<unknown> {
  // Dynamic import so the @tauri-apps/api code is only loaded when needed.
  const mod = await import("@tauri-apps/api/window");
  return mod.getCurrentWindow();
}

async function loadTauriWebview(): Promise<unknown> {
  const mod = await import("@tauri-apps/api/webviewWindow");
  return mod.getCurrentWebviewWindow();
}

interface WindowLike {
  setAlwaysOnTop(on: boolean): Promise<void>;
  setIgnoreCursorEvents(ignore: boolean): Promise<void>;
  setOpacity(value: number): Promise<void>;
}

interface WebviewLike {
  setZoom(factor: number): Promise<void>;
}

export function useTauriOverlay(): OverlayApi {
  if (cachedApi) return cachedApi;

  if (!isTauri) {
    cachedApi = {
      isTauri: false,
      setAlwaysOnTop: async () => undefined,
      setClickThrough: async () => undefined,
      setOpacity: async () => undefined,
      setZoom: async () => undefined,
    };
    return cachedApi;
  }

  cachedApi = {
    isTauri: true,
    async setAlwaysOnTop(on) {
      const win = (await loadTauriWindow()) as WindowLike;
      await win.setAlwaysOnTop(on);
    },
    async setClickThrough(on) {
      const win = (await loadTauriWindow()) as WindowLike;
      await win.setIgnoreCursorEvents(on);
    },
    async setOpacity(value) {
      try {
        const win = (await loadTauriWindow()) as WindowLike;
        await win.setOpacity(value);
        // Native worked — clear any CSS fallback we may have applied earlier.
        document.documentElement.style.opacity = "";
      } catch {
        // Layered-window opacity isn't permitted on this Tauri build — fall
        // back to CSS so the slider stays visually responsive.
        document.documentElement.style.opacity = String(value);
      }
    },
    async setZoom(factor) {
      const wv = (await loadTauriWebview()) as WebviewLike;
      await wv.setZoom(factor);
    },
  };
  return cachedApi;
}
