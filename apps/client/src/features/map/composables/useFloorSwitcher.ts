export interface LoadedMap {
  width: number;
  height: number;
  floors: Map<string, SVGGElement>;
}

interface FloorInfo {
  id: string;
}

export interface UseFloorSwitcher {
  currentFloor: Ref<string | null>;
  setActiveFloor: (id: string) => void;
  /** Step to a higher floor (toward the top of the list); clamps at the topmost. */
  floorUp: () => void;
  /** Step to a lower floor (toward the bottom); clamps at the lowest. */
  floorDown: () => void;
}

/**
 * Drives the per-map floor visibility toggle. Multi-floor maps (Factory,
 * Reserve, Interchange, Labs) keep their floor groups as top-level <g>s in
 * the SVG; we show one floor at a time, dim the ground floor as persistent
 * context, and hide the rest.
 *
 * Single-floor maps (Customs, Woods, etc.) have feature layers as top-level
 * groups instead of floors — `floors` is empty for them and every call here
 * is a safe no-op.
 */
export function useFloorSwitcher(
  loaded: ShallowRef<LoadedMap | null>,
  floors: readonly FloorInfo[],
  defaultFloor: string | null,
): UseFloorSwitcher {
  const currentFloor = ref<string | null>(null);

  function setActiveFloor(id: string): void {
    const floorIds = floors.map((f) => f.id);
    if (floorIds.length === 0) return;
    if (!floorIds.includes(id)) return;
    const groupsByFid = loaded.value?.floors;
    if (!groupsByFid) {
      // SVG hasn't loaded yet; remember choice and apply on load.
      currentFloor.value = id;
      return;
    }
    const ground = defaultFloor;
    for (const fid of floorIds) {
      const group = groupsByFid.get(fid);
      if (!group) continue;
      if (fid === id) {
        group.style.display = '';
        group.style.opacity = '';
      } else if (fid === ground) {
        // Ground is the persistent context — always visible, dimmed when
        // another floor sits on top.
        group.style.display = '';
        group.style.opacity = '0.15';
      } else {
        group.style.display = 'none';
        group.style.opacity = '';
      }
    }
    // SVG draws later siblings on top of earlier ones. Move the active group
    // to the end so it always renders above ground (and above other floors
    // that may sit between them in the original DOM order — e.g. Labs
    // Technical_Level is the first child, ground is the second).
    const activeGroup = groupsByFid.get(id);
    if (activeGroup && activeGroup.parentNode) {
      activeGroup.parentNode.appendChild(activeGroup);
    }
    currentFloor.value = id;
  }

  // Floors are ordered top-to-bottom (index 0 = highest), so "up" steps toward
  // index 0. Clamp at both ends — no wrap-around, so repeated presses at the top
  // or bottom do nothing (matches the rail stepper's disabled-at-edge buttons).
  function shiftFloor(delta: 1 | -1): void {
    const floorIds = floors.map((f) => f.id);
    if (floorIds.length <= 1) return;
    const active = currentFloor.value ?? defaultFloor;
    if (active === null) return;
    const nextIdx = floorIds.indexOf(active) + delta;
    if (nextIdx < 0 || nextIdx >= floorIds.length) return;
    const next = floorIds[nextIdx];
    if (next) setActiveFloor(next);
  }

  function floorUp(): void {
    shiftFloor(-1);
  }

  function floorDown(): void {
    shiftFloor(1);
  }

  return { currentFloor, setActiveFloor, floorUp, floorDown };
}
