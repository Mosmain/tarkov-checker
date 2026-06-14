import L, { type Map as LeafletMap } from 'leaflet';

// Dev-only dataset curation helper: Alt + left click anywhere on the map
// copies the game-space coordinates of that point as `"x": …, "y": 0, "z": …`
// — paste-ready for the extracts JSON files. The CRS already maps Leaflet
// latlng to game coords (lat = z, lng = x); y is not recoverable from a
// 2D click, so it's emitted as 0 to be filled in by hand.
export function useDevCoordsCopy(map: ShallowRef<LeafletMap | null>): void {
  if (!import.meta.env.DEV) return;

  function onClick(e: L.LeafletMouseEvent): void {
    if (!e.originalEvent.altKey) return;
    const instance = map.value;
    if (!instance) return;
    const round = (n: number): number => Math.round(n * 100) / 100;
    const text = `"x": ${round(e.latlng.lng)}, "y": 0, "z": ${round(e.latlng.lat)}`;
    void copyText(text);
    L.popup({ closeButton: false, autoClose: true, autoPan: false })
      .setLatLng(e.latlng)
      .setContent(`<code style="font-size:11px">${text}</code>`)
      .openOn(instance);
    window.setTimeout(() => instance.closePopup(), 1500);
  }

  watch(
    map,
    (instance, _prev, onCleanup) => {
      if (!instance) return;
      instance.on('click', onClick);
      onCleanup(() => instance.off('click', onClick));
    },
    { immediate: true },
  );
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // navigator.clipboard needs a secure context (absent on http://<lan-ip>);
    // legacy execCommand path still works there.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
