import { useOverlayStore } from '../store';
import { opacityPercentBinding } from '../lib/opacity';

export interface UseOverlaySync {
  opacityPercent: WritableComputedRef<number>;
  mapOpacityPercent: WritableComputedRef<number>;
  mapOpacityDisabled: ComputedRef<boolean>;
}

/**
 * Slider-friendly bindings for the two opacity sliders in the Settings
 * drawer and the right-click quick menu. The store keeps both values as
 * 0–1 floats; sliders need integer percent. The "apply to Tauri / set the
 * CSS variable" side lives in `useOverlayBootstrap` (mounted once at App
 * root) so changes propagate even when this composable's host component
 * is unmounted.
 */
export function useOverlaySync(): UseOverlaySync {
  const { opacity: overlayOpacity, mapOpacity: overlayMapOpacity } = storeToRefs(useOverlayStore());

  // Overlay opacity is clamped to 30% min — a fully invisible window is
  // unrecoverable. Map opacity goes all the way to 0 so the user can hide
  // the surface entirely and see only the SVG + markers.
  const opacityPercent = opacityPercentBinding(overlayOpacity, 30, 100);
  const mapOpacityPercent = opacityPercentBinding(overlayMapOpacity, 0, 100);

  // Disabled at full overlay opacity — a transparent map background behind a
  // fully opaque overlay would just look like a hole in the UI.
  const mapOpacityDisabled = computed(() => overlayOpacity.value >= 1);

  return { opacityPercent, mapOpacityPercent, mapOpacityDisabled };
}
