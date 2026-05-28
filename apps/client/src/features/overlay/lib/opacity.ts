/**
 * Slider-friendly binding for a 0–1 opacity store ref. Reads as an integer
 * percent (rounded), writes back clamped to the given range and divided by
 * 100. Used by both the full settings drawer and the right-click quick
 * panel so the two stay in lockstep.
 */
export function opacityPercentBinding(
  source: Ref<number>,
  min = 0,
  max = 100,
): WritableComputedRef<number> {
  return computed<number>({
    get: () => Math.round(source.value * 100),
    set: (pct) => {
      source.value = Math.max(min, Math.min(max, pct)) / 100;
    },
  });
}
