import { describe, it, expect } from 'vitest';
import { tarkovTime } from '@shared/tarkov-time';

const HOUR = 60 * 60 * 1000;

describe('tarkovTime', () => {
  it('at epoch is Moscow midnight + 3h (left) / +15h (right)', () => {
    expect(tarkovTime(0)).toEqual({ left: '03:00', right: '15:00' });
  });

  it('advances 7× real time', () => {
    // 1 real hour → 7 in-game hours.
    expect(tarkovTime(1 * HOUR)).toEqual({ left: '10:00', right: '22:00' });
  });

  it('wraps past midnight', () => {
    // 3 real hours → 21 in-game hours; 03:00 + 21h = 00:00.
    expect(tarkovTime(3 * HOUR)).toEqual({ left: '00:00', right: '12:00' });
  });

  it('the two clocks are always exactly 12h apart', () => {
    for (const ms of [0, HOUR, 1_700_000_000_000, 1_234_567_890]) {
      const { left, right } = tarkovTime(ms);
      const toMin = (s: string) => {
        const [h, m] = s.split(':').map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      const diff = ((toMin(right) - toMin(left)) % (24 * 60) + 24 * 60) % (24 * 60);
      expect(diff).toBe(12 * 60);
    }
  });
});
