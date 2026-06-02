/**
 * Shared (app-singleton) state for the overlay's top header band, so sibling
 * chrome — e.g. the Tarkov clock — can slide out of the way when the band
 * expands on hover/drag. Module-level refs: there is only ever one overlay
 * window. OverlayHeader owns the writes (and resets them when locked/unmounted);
 * everyone else reads `active`.
 */
const hovered = ref(false);
const dragging = ref(false);
const active = computed(() => hovered.value || dragging.value);

export function useOverlayHeaderActive(): {
  hovered: Ref<boolean>;
  dragging: Ref<boolean>;
  active: ComputedRef<boolean>;
} {
  return { hovered, dragging, active };
}
