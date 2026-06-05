import L, { type LatLngExpression } from 'leaflet';
import { useServerEvent } from '@/features/server/composables/useServerEvents';
import { useMapSettingsStore } from '@/features/map/store';
import type { MapLayerContext } from '../registry';

// Follow simply recenters on every new position, keeping the user's zoom.
export type PlayerFollow = 'off' | 'on';

function buildPlayerIconHtml(displayYaw: number | null): string {
  if (displayYaw === null) {
    return `<svg viewBox="-18 -18 36 36" xmlns="http://www.w3.org/2000/svg"><circle class="player-marker" cx="0" cy="0" r="7" /></svg>`;
  }
  return `<svg viewBox="-18 -18 36 36" xmlns="http://www.w3.org/2000/svg"><path class="player-marker" d="M 0,-13 L 9,9 L 0,4 L -9,9 Z" transform="rotate(${displayYaw})" /></svg>`;
}

export function usePlayerLayer(ctx: MapLayerContext): void {
  const { map, mapInfo, visible } = ctx;
  const mapRotation = mapInfo.rotation;
  const yawOffset = mapInfo.yawOffset ?? 0;

  const { playerFollow } = storeToRefs(useMapSettingsStore());

  let playerLayer: L.LayerGroup | null = null;
  let playerCore: L.Marker | null = null;
  let lastX = Number.NaN;
  let lastZ = Number.NaN;
  let lastYaw: number | null = Number.NaN;

  function setPlayerPosition(
    pos: { readonly x: number; readonly y: number; readonly z: number },
    yaw: number | null = null,
  ): void {
    if (!map.value) return;
    const latLng: LatLngExpression = [pos.z, pos.x];
    if (!playerLayer) {
      playerLayer = L.layerGroup();
      if (visible.value) playerLayer.addTo(map.value);
    }
    const displayYaw = yaw === null ? null : yaw + mapRotation + yawOffset;
    const icon = L.divIcon({
      html: buildPlayerIconHtml(displayYaw),
      className: 'player-icon-wrapper',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    if (!playerCore) {
      playerCore = L.marker(latLng, {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
        pane: 'extracts',
      }).addTo(playerLayer);
    } else {
      playerCore.setLatLng(latLng);
      playerCore.setIcon(icon);
    }

    const changed = pos.x !== lastX || pos.z !== lastZ || yaw !== lastYaw;
    if (changed && playerFollow.value === 'on') {
      // Recenter only — keep whatever zoom the user has set.
      map.value.panTo(latLng, { animate: true, duration: 0.4 });
    }
    if (changed) {
      lastX = pos.x;
      lastZ = pos.z;
      lastYaw = yaw;
    }
  }

  function applyVisible(): void {
    if (!playerLayer || !map.value) return;
    const has = map.value.hasLayer(playerLayer);
    if (visible.value && !has) playerLayer.addTo(map.value);
    if (!visible.value && has) map.value.removeLayer(playerLayer);
  }
  watch(visible, applyVisible);

  useServerEvent('position', (msg) => {
    setPlayerPosition({ x: msg.x, y: msg.y, z: msg.z }, msg.yaw ?? null);
  });

  onBeforeUnmount(() => {
    if (playerLayer && map.value) {
      map.value.removeLayer(playerLayer);
    }
    playerLayer = null;
    playerCore = null;
  });
}
