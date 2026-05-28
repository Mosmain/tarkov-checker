import { ref, type Ref, type ShallowRef } from "vue";

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
  nextFloor: () => void;
  prevFloor: () => void;
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
        group.style.display = "";
        group.style.opacity = "";
      } else if (fid === ground) {
        // Ground is the persistent context — always visible, dimmed when
        // another floor sits on top.
        group.style.display = "";
        group.style.opacity = "0.15";
      } else {
        group.style.display = "none";
        group.style.opacity = "";
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

  function shiftFloor(delta: 1 | -1): void {
    const floorIds = floors.map((f) => f.id);
    if (floorIds.length <= 1) return;
    const active = currentFloor.value ?? defaultFloor;
    if (active === null) return;
    const idx = floorIds.indexOf(active);
    // Wrap around so repeated presses cycle the list.
    const nextIdx = (idx + delta + floorIds.length) % floorIds.length;
    const next = floorIds[nextIdx];
    if (next) setActiveFloor(next);
  }

  function nextFloor(): void {
    shiftFloor(1);
  }

  function prevFloor(): void {
    shiftFloor(-1);
  }

  return { currentFloor, setActiveFloor, nextFloor, prevFloor };
}
