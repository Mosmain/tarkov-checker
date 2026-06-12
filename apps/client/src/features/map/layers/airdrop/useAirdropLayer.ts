import L from 'leaflet';
import { useAirdropStore } from '@/features/airdrop/store';
import type { MapLayerContext } from '../registry';

/**
 * Renders the airdrop tracker's only visual artefact: a purple uncertainty
 * circle around the predicted touchdown point. Visible during `result` and
 * `confirmingClear`, with a radius read reactively from the store
 * (`dropMarkerRadius`, in game-meters) so the user's Settings slider
 * updates the circle live.
 *
 * No icon for the predicted point or the first sight-shot — the circle
 * alone reads as "drop somewhere in this area", and the banner carries
 * any text the user needs. Less visual noise on a map already populated
 * with extracts, the player arrow, and the floor switcher.
 *
 * The circle goes on the existing `extracts` pane so it stacks above
 * extract icons but below the player marker.
 */
export function useAirdropLayer(ctx: MapLayerContext): void {
  const { map, visible } = ctx;
  const store = useAirdropStore();
  let dropAreaCircle: L.Circle | null = null;

  function clearAll(): void {
    if (dropAreaCircle && map.value) map.value.removeLayer(dropAreaCircle);
    dropAreaCircle = null;
  }

  function placeDrop(): void {
    if (!map.value || !store.outcome || !store.outcome.ok || dropAreaCircle) return;
    const { x, z } = store.outcome.result;
    // Custom CRS based on CRS.Simple — `radius` is in our latLng units, which
    // we've calibrated as 1 unit = 1 in-game meter, so passing meters directly
    // gives a visually correct circle at every zoom.
    dropAreaCircle = L.circle([z, x], {
      radius: store.dropMarkerRadius,
      pane: 'extracts',
      color: '#a78bfa', // PrimeVue primary purple-400
      weight: 2,
      fillColor: '#a78bfa',
      fillOpacity: 0.2,
      interactive: false,
    }).addTo(map.value);
  }

  // The circle stays through `confirmingClear` — the user is about to wipe
  // it, they should see exactly what they're about to lose.
  const showDrop = (): boolean =>
    visible.value && (store.phase === 'result' || store.phase === 'confirmingClear');

  watch(
    () => store.phase,
    () => {
      clearAll();
      if (showDrop()) placeDrop();
    },
    { flush: 'post' },
  );

  // Radius change — only the circle needs updating. Avoids removing/re-adding
  // (which can flicker on slow GPUs).
  watch(
    () => store.dropMarkerRadius,
    (r) => {
      if (dropAreaCircle) dropAreaCircle.setRadius(r);
    },
  );

  // Re-attach when the map mounts AFTER the store already has state (e.g.
  // map-code switch while a result is showing).
  watch(map, (m) => {
    if (!m) return;
    if (showDrop()) placeDrop();
  });

  watch(visible, () => {
    clearAll();
    if (showDrop()) placeDrop();
  });

  onBeforeUnmount(clearAll);
}
