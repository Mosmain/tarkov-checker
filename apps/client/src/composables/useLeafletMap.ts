import { onMounted, onBeforeUnmount, type Ref } from "vue";
import L, { type Map as LeafletMap } from "leaflet";

interface UseLeafletMapOptions {
  center?: L.LatLngExpression;
  zoom?: number;
}

export function useLeafletMap(
  containerRef: Ref<HTMLElement | null>,
  options: UseLeafletMapOptions = {},
): { getMap: () => LeafletMap | null } {
  let map: LeafletMap | null = null;

  onMounted(() => {
    if (!containerRef.value) return;
    map = L.map(containerRef.value, {
      center: options.center ?? [0, 0],
      zoom: options.zoom ?? 2,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);
  });

  onBeforeUnmount(() => {
    map?.remove();
    map = null;
  });

  return { getMap: () => map };
}
