import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { useLayerVisibility } from '@/features/map/composables/useLayerVisibility';

// Each test uses a distinct id — the composable caches refs in a module-level
// singleton that outlives a single test (by design: the persist watch must
// survive component remounts).
describe('useLayerVisibility', () => {
  beforeEach(() => localStorage.clear());

  it('defaults a fresh layer to visible', () => {
    expect(useLayerVisibility('test-default').value).toBe(true);
  });

  it('returns the same ref for the same id (singleton)', () => {
    expect(useLayerVisibility('test-singleton')).toBe(useLayerVisibility('test-singleton'));
  });

  it('persists a toggle to tc.layer.<id>.visible', async () => {
    const v = useLayerVisibility('test-persist');
    v.value = false;
    await nextTick();
    expect(localStorage.getItem('tc.layer.test-persist.visible')).toBe('false');
  });

  it('reads an existing persisted value on first use', () => {
    localStorage.setItem('tc.layer.test-seeded.visible', 'false');
    expect(useLayerVisibility('test-seeded').value).toBe(false);
  });
});
