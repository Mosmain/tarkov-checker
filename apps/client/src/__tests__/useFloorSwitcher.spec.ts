import { describe, it, expect } from 'vitest';
import { shallowRef } from 'vue';
import { useFloorSwitcher, type LoadedMap } from '@/features/map/composables/useFloorSwitcher';

// Floors are ordered top-to-bottom (index 0 = highest floor).
const FLOORS = [{ id: '2' }, { id: '1' }, { id: '0' }, { id: '-1' }];

// loaded = null: no SVG, so setActiveFloor just records the choice in
// currentFloor (the DOM toggle path is skipped) — perfect for testing the
// stepping logic in isolation.
function make(floors = FLOORS, defaultFloor = '0') {
  return useFloorSwitcher(shallowRef<LoadedMap | null>(null), floors, defaultFloor);
}

describe('useFloorSwitcher', () => {
  it('floorUp goes to a higher floor, floorDown to a lower one', () => {
    const f = make();
    f.setActiveFloor('0');
    f.floorUp();
    expect(f.currentFloor.value).toBe('1');
    f.floorUp();
    expect(f.currentFloor.value).toBe('2');
    f.floorDown();
    expect(f.currentFloor.value).toBe('1');
  });

  it('clamps at the top floor (no wrap-around)', () => {
    const f = make();
    f.setActiveFloor('2');
    f.floorUp();
    expect(f.currentFloor.value).toBe('2');
  });

  it('clamps at the bottom floor (no wrap-around)', () => {
    const f = make();
    f.setActiveFloor('-1');
    f.floorDown();
    expect(f.currentFloor.value).toBe('-1');
  });

  it('starts from the default floor when none is active yet', () => {
    const f = make();
    f.floorUp();
    expect(f.currentFloor.value).toBe('1');
  });

  it('is a no-op on single-floor maps', () => {
    const f = make([{ id: 'only' }], 'only');
    f.floorUp();
    f.floorDown();
    expect(f.currentFloor.value).toBeNull();
  });
});
