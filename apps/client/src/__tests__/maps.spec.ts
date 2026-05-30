import { describe, it, expect } from 'vitest';
import { canonicalMapCode, isKnownMapCode, mapDisplayName, VISIBLE_MAP_CODES } from '@shared/maps';

describe('canonicalMapCode', () => {
  it('returns canonical codes unchanged', () => {
    expect(canonicalMapCode('bigmap')).toBe('bigmap');
    expect(canonicalMapCode('factory4_day')).toBe('factory4_day');
    expect(canonicalMapCode('tarkovstreets')).toBe('tarkovstreets');
    expect(canonicalMapCode('rezervbase')).toBe('rezervbase');
    expect(canonicalMapCode('sandbox')).toBe('sandbox');
    expect(canonicalMapCode('lighthouse')).toBe('lighthouse');
  });

  it('resolves pre-1.0.5.0 night/high aliases', () => {
    expect(canonicalMapCode('factory4_night')).toBe('factory4_day');
    expect(canonicalMapCode('sandbox_high')).toBe('sandbox');
  });

  it('resolves the 1.0.5.0 bundle-rename aliases captured live on 2026-05-30', () => {
    expect(canonicalMapCode('factory_day')).toBe('factory4_day');
    expect(canonicalMapCode('factory_night')).toBe('factory4_day');
    expect(canonicalMapCode('city')).toBe('tarkovstreets');
    expect(canonicalMapCode('rezerv_base')).toBe('rezervbase');
    expect(canonicalMapCode('shopping_mall')).toBe('interchange');
  });

  it('passes unknown codes through verbatim (caller filters)', () => {
    expect(canonicalMapCode('icebreaker')).toBe('icebreaker');
    expect(canonicalMapCode('')).toBe('');
  });
});

describe('isKnownMapCode', () => {
  it('accepts canonical and alias keys alike', () => {
    expect(isKnownMapCode('bigmap')).toBe(true);
    expect(isKnownMapCode('factory_day')).toBe(true);
    expect(isKnownMapCode('city')).toBe(true);
    expect(isKnownMapCode('rezerv_base')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(isKnownMapCode('icebreaker')).toBe(false);
    // Case-sensitive: rcid/Transit/Location lines vary in case across patches
    // (see parse-log.ts), so the parser lowercases before any lookup happens.
    expect(isKnownMapCode('Rezerv_Base')).toBe(false);
    expect(isKnownMapCode('TarkovStreets')).toBe(false);
  });
});

describe('VISIBLE_MAP_CODES', () => {
  it('only exposes canonical entries — no aliases reach the picker', () => {
    for (const code of VISIBLE_MAP_CODES) {
      expect(canonicalMapCode(code)).toBe(code);
    }
  });

  it('excludes the 1.0.5.0 rename aliases from user-visible pickers', () => {
    expect(VISIBLE_MAP_CODES).not.toContain('factory_day');
    expect(VISIBLE_MAP_CODES).not.toContain('factory_night');
    expect(VISIBLE_MAP_CODES).not.toContain('city');
    expect(VISIBLE_MAP_CODES).not.toContain('rezerv_base');
    expect(VISIBLE_MAP_CODES).not.toContain('shopping_mall');
  });
});

describe('mapDisplayName', () => {
  it('uses the canonical display name even when called with an alias key', () => {
    // mapDisplayName reads the alias entry's own displayName field — we copy
    // it from the canonical so alias and canonical produce the same string.
    expect(mapDisplayName('factory_day')).toBe('Factory');
    expect(mapDisplayName('city')).toBe('Streets of Tarkov');
    expect(mapDisplayName('rezerv_base')).toBe('Reserve');
    expect(mapDisplayName('shopping_mall')).toBe('Interchange');
    expect(mapDisplayName('bigmap')).toBe('Customs');
  });
});
