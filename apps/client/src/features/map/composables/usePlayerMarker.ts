import L, { type Map as LeafletMap, type LatLngExpression } from 'leaflet';

export type PlayerFollow = 'off' | 'sm' | 'md' | 'lg';

interface Position3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface UsePlayerMarker {
  setPlayerPosition: (pos: Position3D, yaw?: number | null) => void;
  clearPlayerPosition: () => void;
  setPlayerFollow: (mode: PlayerFollow) => void;
}

/** Zoom levels (delta from initialZoom) for each follow mode; clamped to maxZoom. */
const FOLLOW_ZOOM_DELTA: Readonly<Record<Exclude<PlayerFollow, 'off'>, number>> = {
  sm: 1,
  md: 2,
  lg: 3,
};

function buildPlayerIconHtml(displayYaw: number | null): string {
  if (displayYaw === null) {
    return `<svg viewBox="-18 -18 36 36" xmlns="http://www.w3.org/2000/svg"><circle class="player-marker" cx="0" cy="0" r="7" /></svg>`;
  }
  return `<svg viewBox="-18 -18 36 36" xmlns="http://www.w3.org/2000/svg"><path class="player-marker" d="M 0,-13 L 9,9 L 0,4 L -9,9 Z" transform="rotate(${displayYaw})" /></svg>`;
}

/**
 * Manages the player marker — a div-icon arrow (or dot when yaw is unknown)
 * placed on the same custom `extracts` pane as extract markers. Implements
 * the auto-follow logic: when the player actually moves (skipping spam
 * updates for a stationary player), recenter and zoom in by the configured
 * step.
 */
export function usePlayerMarker(
  map: ShallowRef<LeafletMap | null>,
  mapRotation: number,
  initialZoom: Ref<number>,
): UsePlayerMarker {
  let playerLayer: L.LayerGroup | null = null;
  let playerCore: L.Marker | null = null;
  let mode: PlayerFollow = 'off';
  let lastX = Number.NaN;
  let lastZ = Number.NaN;
  let lastYaw: number | null = Number.NaN;

  function setPlayerFollow(next: PlayerFollow): void {
    mode = next;
  }

  function setPlayerPosition(pos: Position3D, yaw: number | null = null): void {
    if (!map.value) return;
    const latLng: LatLngExpression = [pos.z, pos.x];
    if (!playerLayer) {
      playerLayer = L.layerGroup().addTo(map.value);
    }
    // The in-game yaw must be rotated by the map's own coordinateRotation
    // so the arrow points where the player is looking in the rendered view.
    const displayYaw = yaw === null ? null : yaw + mapRotation;
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
    if (changed && mode !== 'off') {
      const targetZoom = Math.min(
        initialZoom.value + FOLLOW_ZOOM_DELTA[mode],
        map.value.getMaxZoom(),
      );
      map.value.setView(latLng, targetZoom, { animate: true, duration: 0.4 });
    }
    if (changed) {
      lastX = pos.x;
      lastZ = pos.z;
      lastYaw = yaw;
    }
  }

  function clearPlayerPosition(): void {
    if (playerLayer && map.value) {
      map.value.removeLayer(playerLayer);
    }
    playerLayer = null;
    playerCore = null;
  }

  return { setPlayerPosition, clearPlayerPosition, setPlayerFollow };
}
