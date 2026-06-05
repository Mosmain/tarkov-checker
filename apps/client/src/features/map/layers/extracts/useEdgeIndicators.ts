import type { Map as LeafletMap } from 'leaflet';

/** One off-screen target: position in (lat=z, lng=x) + the arrow colour. */
export interface EdgeArrow {
  lat: number;
  lng: number;
  color: string;
}

const MARGIN = 18; // px inset from the container edge
const ARROW_PX = 22;
const RAIL_GAP = 16; // arrow-centre offset past the rail's right edge
const RAIL_PAD = 6; // extend the avoid band slightly past the rail's top/bottom

/**
 * Renders small arrows on the viewport edge pointing at off-screen extracts.
 *
 * The arrows live in a plain overlay `<div>` appended to the Leaflet container
 * (NOT a map pane) so they stay pixel-fixed to the viewport — a marker in a
 * pane would be dragged around by the pane transform during a pan. On every
 * map move/zoom we recompute each target's container point; off-screen ones get
 * an arrow clamped to the inset rectangle edge, rotated to point outward.
 */
export function createEdgeIndicators(map: LeafletMap, getArrows: () => EdgeArrow[]) {
  const overlay = document.createElement('div');
  overlay.className = 'edge-indicators';
  map.getContainer().appendChild(overlay);

  const pool: HTMLElement[] = [];

  function take(i: number): HTMLElement {
    let el = pool[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'edge-indicator';
      // Thick dark outline (drawn behind the fill via paint-order) so the
      // small coloured arrow reads on any part of the busy map.
      el.innerHTML = `<svg viewBox="0 0 24 24" width="${ARROW_PX}" height="${ARROW_PX}" aria-hidden="true"><path d="M12 3 L20 19 L12 15 L4 19 Z" fill="currentColor" stroke="#0a0b0d" stroke-width="3" stroke-linejoin="round" paint-order="stroke"/></svg>`;
      overlay.appendChild(el);
      pool[i] = el;
    }
    return el;
  }

  function update(): void {
    const size = map.getSize();
    const cx = size.x / 2;
    const cy = size.y / 2;
    const halfW = cx - MARGIN;
    const halfH = cy - MARGIN;

    // The on-map left rail is an obstacle: left-edge arrows whose y falls within
    // its vertical span get pushed out to the rail's right edge, so they wrap
    // around the panel instead of hiding behind it. Measured each frame, so it
    // follows the rail's changing height (floor stepper) and disappears entirely
    // when the rail is hidden (locked overlay).
    const containerRect = map.getContainer().getBoundingClientRect();
    const railEl = document.querySelector('.layer-rail');
    let avoid: { right: number; top: number; bottom: number } | null = null;
    if (railEl) {
      const r = railEl.getBoundingClientRect();
      if (r.width > 0) {
        avoid = {
          right: r.right - containerRect.left,
          top: r.top - containerRect.top,
          bottom: r.bottom - containerRect.top,
        };
      }
    }

    let used = 0;
    for (const a of getArrows()) {
      const cp = map.latLngToContainerPoint([a.lat, a.lng]);
      if (cp.x >= 0 && cp.x <= size.x && cp.y >= 0 && cp.y <= size.y) continue; // on-screen
      const dx = cp.x - cx;
      const dy = cp.y - cy;
      if (dx === 0 && dy === 0) continue;
      const t = Math.min(
        dx !== 0 ? halfW / Math.abs(dx) : Infinity,
        dy !== 0 ? halfH / Math.abs(dy) : Infinity,
      );
      let ex = cx + dx * t;
      const ey = cy + dy * t;
      // Wrap a left-edge arrow around the rail panel when it'd land behind it.
      // Only ever push rightward — as the rail slides out (lock), its right edge
      // moves left of the arrow and the push naturally stops, so arrows glide
      // back to the true edge instead of chasing the panel off-screen.
      if (
        avoid &&
        dx < 0 &&
        ex <= MARGIN + 1 &&
        ey >= avoid.top - RAIL_PAD &&
        ey <= avoid.bottom + RAIL_PAD &&
        avoid.right + RAIL_GAP > ex
      ) {
        ex = avoid.right + RAIL_GAP;
      }
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // SVG arrow points up
      const el = take(used);
      el.style.left = `${ex}px`;
      el.style.top = `${ey}px`;
      el.style.transform = `rotate(${deg}deg)`;
      el.style.color = a.color;
      el.style.display = '';
      used++;
    }
    for (let i = used; i < pool.length; i++) {
      const el = pool[i];
      if (el) el.style.display = 'none';
    }
  }

  const onMove = (): void => update();
  map.on('move zoom zoomend viewreset resize', onMove);
  update();

  return {
    update,
    destroy(): void {
      map.off('move zoom zoomend viewreset resize', onMove);
      overlay.remove();
      pool.length = 0;
    },
  };
}
