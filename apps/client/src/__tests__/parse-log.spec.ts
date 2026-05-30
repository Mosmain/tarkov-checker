import { describe, it, expect } from 'vitest';
import { parseLogLine } from '@shared/parse-log';
import cases from '@shared/__fixtures__/parse-log-cases.json';

// ---------------------------------------------------------------------------
// Fixture-driven tests — parity with the Rust port (logs.rs).
// The JSON source is packages/shared/src/__fixtures__/parse-log-cases.json.
// The same file is consumed by Rust tests so both ports are always tested
// against identical input/output pairs.
// ---------------------------------------------------------------------------
describe('parseLogLine (fixture-driven)', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(parseLogLine(c.line)).toEqual(c.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Non-fixture tests — cases that need programmatic logic or are specific to
// the TS implementation details rather than shared parity.
// ---------------------------------------------------------------------------
describe('parseLogLine (TS-specific)', () => {
  describe('source priority', () => {
    it('prefers scene preset rcid over Transit when both are on the same line (defensive)', () => {
      // This is already covered in the fixture, but kept here as a named
      // documentation test so the priority contract is explicit in the TS suite.
      const line =
        'scene preset path:maps/customs_preset.bundle rcid:bigmap.scenespreset.asset [Transit] Flag:None, Locations:woods -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'bigmap' });
    });
  });
});
