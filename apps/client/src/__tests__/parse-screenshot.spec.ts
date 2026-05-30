import { describe, it, expect } from 'vitest';
import { parseScreenshotFilename, quaternionToYawDegrees } from '@shared/parse-screenshot';
import cases from '@shared/__fixtures__/parse-screenshot-cases.json';

// ---------------------------------------------------------------------------
// Fixture-driven tests — parity with the Rust port (screenshots.rs).
// The JSON source is packages/shared/src/__fixtures__/parse-screenshot-cases.json.
// The same file is consumed by Rust tests so both ports are always tested
// against identical input/output pairs.
// ---------------------------------------------------------------------------
describe('parseScreenshotFilename (fixture-driven)', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(parseScreenshotFilename(c.filename)).toEqual(c.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Non-fixture tests — quaternion math is pure TS, not covered by Rust parity
// fixtures (it's unit-testable independently of filename parsing).
// ---------------------------------------------------------------------------
describe('quaternionToYawDegrees', () => {
  it('identity quaternion yields 0°', () => {
    expect(quaternionToYawDegrees({ qx: 0, qy: 0, qz: 0, qw: 1 })).toBeCloseTo(0, 6);
  });

  it('90° around Y axis yields 90°', () => {
    const s = Math.sin(Math.PI / 4);
    const c = Math.cos(Math.PI / 4);
    expect(quaternionToYawDegrees({ qx: 0, qy: s, qz: 0, qw: c })).toBeCloseTo(90, 4);
  });

  it('180° around Y axis yields 180°', () => {
    expect(quaternionToYawDegrees({ qx: 0, qy: 1, qz: 0, qw: 0 })).toBeCloseTo(180, 4);
  });
});
