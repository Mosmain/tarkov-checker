/**
 * Escape from Tarkov in-game clock.
 *
 * Tarkov time runs at 7× real time, anchored to Moscow (UTC+3) — a full
 * 24h day passes in ~3h26m of real time. Two clocks are shown in-raid,
 * offset by 12 in-game hours (the canonical tarkov.dev formula). This is
 * pure arithmetic on a millisecond timestamp so it can be unit-tested
 * without faking `Date`.
 */
const TARKOV_RATIO = 7;
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3 (Norvinsk / Russia)
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

function timeOfDayMs(nowMs: number, rightSide: boolean): number {
  const offset = MOSCOW_OFFSET_MS + (rightSide ? HALF_DAY_MS : 0);
  return (((offset + nowMs * TARKOV_RATIO) % ONE_DAY_MS) + ONE_DAY_MS) % ONE_DAY_MS;
}

function formatHHMM(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export interface TarkovClock {
  /** Left clock (e.g. 11:34). */
  readonly left: string;
  /** Right clock, +12h from the left (e.g. 23:34). */
  readonly right: string;
  /** Seconds (e.g. 07) — identical for both clocks, which differ by exactly 12h. */
  readonly seconds: string;
}

/** Both in-game clocks for the given real-time millisecond timestamp. */
export function tarkovTime(nowMs: number): TarkovClock {
  const leftMs = timeOfDayMs(nowMs, false);
  return {
    left: formatHHMM(leftMs),
    right: formatHHMM(timeOfDayMs(nowMs, true)),
    seconds: String(Math.floor((leftMs % 60000) / 1000)).padStart(2, '0'),
  };
}
