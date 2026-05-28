import { useOverlayStore } from "../store";
import { useTauriOverlay } from "./useTauriOverlay";
import { opacityPercentBinding } from "../lib/opacity";

export interface UseOverlaySync {
  opacityPercent: WritableComputedRef<number>;
  mapOpacityPercent: WritableComputedRef<number>;
  mapOpacityDisabled: ComputedRef<boolean>;
}

/**
 * Mirrors overlay-related settings into the Tauri window in real time
 * (always-on-top, native opacity, webview zoom) and drives the
 * `--map-bg-alpha` CSS variable that controls the Leaflet container's
 * background transparency.
 *
 * Returns slider-friendly integer percent bindings for the two opacity
 * sliders — the store keeps them as 0–1 floats internally.
 */
export function useOverlaySync(): UseOverlaySync {
  const overlay = useTauriOverlay();
  const {
    alwaysOnTop: overlayAlwaysOnTop,
    opacity: overlayOpacity,
    mapOpacity: overlayMapOpacity,
    zoom: overlayZoom,
  } = storeToRefs(useOverlayStore());

  // Overlay opacity is clamped to 30% min — a fully invisible window is
  // unrecoverable. Map opacity goes all the way to 0 so the user can hide
  // the surface entirely and see only the SVG + markers.
  const opacityPercent = opacityPercentBinding(overlayOpacity, 30, 100);
  const mapOpacityPercent = opacityPercentBinding(overlayMapOpacity, 0, 100);

  // Disabled at full overlay opacity — a transparent map background behind a
  // fully opaque overlay would just look like a hole in the UI.
  const mapOpacityDisabled = computed(() => overlayOpacity.value >= 1);

  // When overall opacity is 100% we force the map back to fully opaque
  // regardless of the stored value, keeping the visual model consistent with
  // the disabled-slider hint.
  function applyMapBgAlpha(): void {
    const effective = overlayOpacity.value < 1 ? overlayMapOpacity.value : 1;
    document.documentElement.style.setProperty("--map-bg-alpha", String(effective));
  }
  applyMapBgAlpha();
  watch([overlayOpacity, overlayMapOpacity], applyMapBgAlpha);

  if (overlay.isTauri) {
    void overlay.setAlwaysOnTop(overlayAlwaysOnTop.value);
    void overlay.setOpacity(overlayOpacity.value);
    void overlay.setZoom(Number(overlayZoom.value) / 100);
    watch(overlayAlwaysOnTop, (v) => void overlay.setAlwaysOnTop(v));
    watch(overlayOpacity, (v) => void overlay.setOpacity(v));
    watch(overlayZoom, (v) => void overlay.setZoom(Number(v) / 100));
  }

  return { opacityPercent, mapOpacityPercent, mapOpacityDisabled };
}
