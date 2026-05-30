import { describe, it, expect } from 'vitest';
import { triangulateDropPoint } from '@shared/triangulate';

describe('triangulateDropPoint', () => {
  it('finds the obvious intersection of perpendicular sight-lines', () => {
    // Player A at (0, 0) facing +X (yaw 90°).
    // Player B at (10, 10) facing -Z (yaw 180°).
    // The two rays intersect at (10, 0).
    const out = triangulateDropPoint({ x: 0, z: 0, yawDeg: 90 }, { x: 10, z: 10, yawDeg: 180 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.x).toBeCloseTo(10, 6);
    expect(out.result.z).toBeCloseTo(0, 6);
    expect(out.result.distFromA).toBeCloseTo(10, 6);
    expect(out.result.distFromB).toBeCloseTo(10, 6);
  });

  it('handles a realistic Tarkov scenario: two shots ~5m apart, drop ~80m ahead', () => {
    // Player at origin looking due +Z (yaw 0°) at a drop at (3, 80).
    // Then sidesteps to (5, 0) and faces it again — yaw is now atan2(-2, 80)
    // in degrees ≈ -1.43° (slightly toward -X to point back at the drop).
    const dropX = 3;
    const dropZ = 80;
    const yawA = (Math.atan2(dropX, dropZ) * 180) / Math.PI;
    const yawB = (Math.atan2(dropX - 5, dropZ) * 180) / Math.PI;
    const out = triangulateDropPoint({ x: 0, z: 0, yawDeg: yawA }, { x: 5, z: 0, yawDeg: yawB });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.x).toBeCloseTo(dropX, 4);
    expect(out.result.z).toBeCloseTo(dropZ, 4);
  });

  it('rejects identical yaws (parallel rays)', () => {
    const out = triangulateDropPoint({ x: 0, z: 0, yawDeg: 45 }, { x: 10, z: 0, yawDeg: 45 });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe('parallel');
  });

  it('rejects anti-parallel yaws (180° apart, also degenerate)', () => {
    const out = triangulateDropPoint({ x: 0, z: 0, yawDeg: 45 }, { x: 10, z: 0, yawDeg: 225 });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe('parallel');
  });

  it('rejects intersection behind one of the players', () => {
    // Both face -Z (yaw 180°). Intersection would be at z < 0 from both —
    // behind them. With det = sin(0) = 0 this hits the parallel branch first;
    // pick yaws that are not parallel but still produce backward intersection.
    // A at (0, 0) facing +X. B at (0, 5) facing -X. Their rays diverge —
    // intersection requires going BACKWARD along both.
    const out = triangulateDropPoint({ x: 0, z: 0, yawDeg: 90 }, { x: 0, z: 5, yawDeg: 270 });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe('parallel');
    // Anti-parallel case hits parallel detector first — that's fine. Construct
    // a non-parallel "behind" case: rays diverge slightly.
    const out2 = triangulateDropPoint({ x: 0, z: 0, yawDeg: 100 }, { x: 0, z: 5, yawDeg: 260 });
    expect(out2.ok).toBe(false);
    if (out2.ok) return;
    expect(out2.failure.kind).toBe('behind');
  });

  it('rejects far-away intersections (rays nearly parallel)', () => {
    // A at origin facing pure +Z. B sidesteps 5m to +X and yaws very slightly
    // INWARD (-0.05°) so its sight-line eventually crosses A's. Because the
    // angle is razor-thin, the crossing happens ~5700m ahead — well past our
    // 2000m sanity ceiling.
    const out = triangulateDropPoint({ x: 0, z: 0, yawDeg: 0 }, { x: 5, z: 0, yawDeg: -0.05 });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.failure.kind).toBe('too_far');
  });
});
