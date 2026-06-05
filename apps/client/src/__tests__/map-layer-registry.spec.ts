import { describe, it, expect } from 'vitest';
import { registerMapLayer, useMapLayers } from '@/features/map/layers/registry';

const noop = (): void => {};

describe('map layer registry', () => {
  it('registers a layer and exposes it via useMapLayers', () => {
    registerMapLayer({ id: 'test-reg', mount: noop, category: 'loot', order: 99, titleKey: 'x' });
    const found = useMapLayers().value.find((l) => l.id === 'test-reg');
    expect(found?.category).toBe('loot');
    expect(found?.order).toBe(99);
  });

  it('replaces by id on re-register (HMR-safe), never duplicating', () => {
    registerMapLayer({ id: 'test-dup', mount: noop, category: 'player', order: 1, titleKey: 'a' });
    registerMapLayer({ id: 'test-dup', mount: noop, category: 'quests', order: 2, titleKey: 'b' });
    const matches = useMapLayers().value.filter((l) => l.id === 'test-dup');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.category).toBe('quests');
  });
});
