import { ref, type Ref } from 'vue';

/**
 * The on-map LayerRail's bounding rect in VIEWPORT coordinates (px), or null
 * when the rail is hidden. Published by `LayerRail.vue`; consumed by
 * edge-indicator layers so off-screen-marker arrows can wrap around the rail
 * WITHOUT scraping the DOM (`document.querySelector('.layer-rail')`) or knowing
 * anything about overlay-lock state. Reactive, so consumers can `watch` it and
 * repaint as the rail appears / moves / disappears.
 *
 * A module-level singleton: there is exactly one rail. Future chrome that
 * off-screen indicators should avoid can extend this into a list.
 */
export interface RailRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

const railRect = ref<RailRect | null>(null);

/** Read side — edge-indicator layers. */
export function useRailObstacle(): Ref<RailRect | null> {
  return railRect;
}

/** Write side — the LayerRail publishes its rect (or null when hidden). */
export function setRailObstacle(rect: RailRect | null): void {
  railRect.value = rect;
}
