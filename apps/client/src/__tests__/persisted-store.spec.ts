import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

const enumSchema = z.enum(['a', 'b', 'c']);
const numberSchema = z.number().int().min(0).max(100);

describe('persistedRef', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default value when nothing is persisted', () => {
    const r = persistedRef('rm.test.empty', enumSchema, 'a');
    expect(r.value).toBe('a');
  });

  it('round-trips a value through localStorage', async () => {
    const a = persistedRef('rm.test.roundtrip', enumSchema, 'a');
    a.value = 'b';
    await nextTick();
    expect(localStorage.getItem('rm.test.roundtrip')).toBe('"b"');

    const b = persistedRef('rm.test.roundtrip', enumSchema, 'a');
    expect(b.value).toBe('b');
  });

  it('falls back to default on corrupt JSON without throwing', () => {
    localStorage.setItem('rm.test.corrupt', '{not valid json');
    const r = persistedRef('rm.test.corrupt', enumSchema, 'c');
    expect(r.value).toBe('c');
  });

  it('leaves the corrupt entry in place so a future schema can recover it', () => {
    localStorage.setItem('rm.test.corrupt-keep', '{not valid json');
    persistedRef('rm.test.corrupt-keep', enumSchema, 'c');
    expect(localStorage.getItem('rm.test.corrupt-keep')).toBe('{not valid json');
  });

  it('falls back to default on schema mismatch', () => {
    localStorage.setItem('rm.test.mismatch', '"not-in-enum"');
    const r = persistedRef('rm.test.mismatch', enumSchema, 'a');
    expect(r.value).toBe('a');
  });

  it('falls back to default when a number outranges its schema', () => {
    localStorage.setItem('rm.test.range', '999');
    const r = persistedRef('rm.test.range', numberSchema, 42);
    expect(r.value).toBe(42);
  });

  it('keeps keys isolated — writing one does not touch another', async () => {
    const left = persistedRef('rm.test.left', enumSchema, 'a');
    const right = persistedRef('rm.test.right', enumSchema, 'a');
    left.value = 'b';
    right.value = 'c';
    await nextTick();
    expect(localStorage.getItem('rm.test.left')).toBe('"b"');
    expect(localStorage.getItem('rm.test.right')).toBe('"c"');
  });

  it('persists nested objects through deep watch', async () => {
    const objSchema = z.object({ count: z.number(), tags: z.array(z.string()) });
    const r = persistedRef('rm.test.nested', objSchema, { count: 0, tags: [] });
    r.value.count = 5;
    r.value.tags.push('one');
    await nextTick();
    const stored: unknown = JSON.parse(localStorage.getItem('rm.test.nested') ?? 'null');
    expect(stored).toEqual({ count: 5, tags: ['one'] });
  });
});
