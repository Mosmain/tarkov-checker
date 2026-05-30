export interface TriangulationSample {
  /** Player world-x at the moment of the PrintScreen screenshot. */
  readonly x: number;
  /** Player world-z at the moment of the PrintScreen screenshot. */
  readonly z: number;
  /**
   * In-game yaw in degrees, in the same convention `quaternionToYawDegrees`
   * returns: 0° = facing world +Z, positive = clockwise looking down from
   * above. The triangulation projects this onto the (X, Z) plane — pitch is
   * irrelevant because the airdrop falls vertically, so its (X, Z) position
   * is on the player's horizontal sight-line regardless of where they're
   * looking up/down.
   */
  readonly yawDeg: number;
}

export interface TriangulationResult {
  /** World-X of the predicted airdrop touchdown point. */
  readonly x: number;
  /** World-Z of the predicted airdrop touchdown point. */
  readonly z: number;
  /** Forward distance along sample A's sight-line to the intersection. */
  readonly distFromA: number;
  /** Forward distance along sample B's sight-line to the intersection. */
  readonly distFromB: number;
}

export type TriangulationFailure =
  | { kind: 'parallel'; message: string }
  | { kind: 'behind'; message: string }
  | { kind: 'too_far'; message: string; distance: number };

export type TriangulationOutcome =
  | { ok: true; result: TriangulationResult }
  | { ok: false; failure: TriangulationFailure };

/**
 * Two yaw vectors are "parallel" when sin(Δyaw) is within this tolerance of
 * zero. 1e-4 ≈ 0.006°, well below realistic gameplay precision but tight
 * enough to keep the determinant from amplifying screenshot-rounding noise
 * into a wild intersection point.
 */
const PARALLEL_EPSILON = 1e-4;

/**
 * Beyond this forward distance from either sample, the intersection is in
 * "must be a bad angle" territory — Tarkov maps top out around 700–1000m in
 * any direction, so a 2000m projection means the rays nearly grazed past
 * each other and the result is meaningless.
 */
const MAX_FORWARD_DISTANCE = 2000;

/**
 * Two-sample triangulation. Each sample carries a player position (x, z) and
 * a yaw direction. We project each yaw into the (X, Z) plane as a ray
 * starting from the player and pointing forward, then solve the 2×2 linear
 * system for the two rays' intersection.
 *
 * Convention check: per `quaternionToYawDegrees`, yaw 0° means facing world
 * +Z, and positive yaw rotates clockwise looking down. So the forward unit
 * vector at yaw θ is `(sin θ, cos θ)` in `(x, z)`. The determinant of the
 * stacked direction matrix equals `sin(yawB - yawA)`, which we use as the
 * parallel-rays detector.
 *
 * Returns null-equivalent {ok:false, failure:...} for the three failure
 * modes we treat as user-actionable: parallel rays, intersection behind the
 * player, and absurdly distant intersection.
 */
export function triangulateDropPoint(
  a: TriangulationSample,
  b: TriangulationSample,
): TriangulationOutcome {
  const yawA = (a.yawDeg * Math.PI) / 180;
  const yawB = (b.yawDeg * Math.PI) / 180;
  const sinA = Math.sin(yawA);
  const cosA = Math.cos(yawA);
  const sinB = Math.sin(yawB);
  const cosB = Math.cos(yawB);

  const det = sinB * cosA - sinA * cosB; // = sin(yawB - yawA)
  if (Math.abs(det) < PARALLEL_EPSILON) {
    return {
      ok: false,
      failure: {
        kind: 'parallel',
        message: 'Sight-lines are parallel — change your viewing angle between shots.',
      },
    };
  }

  const dx = b.x - a.x;
  const dz = b.z - a.z;

  // Cramer's rule on
  //   [ sinA  -sinB ] [t]   [dx]
  //   [ cosA  -cosB ] [s] = [dz]
  const t = (sinB * dz - cosB * dx) / det;
  const s = (sinA * dz - cosA * dx) / det;

  if (t < 0 || s < 0) {
    return {
      ok: false,
      failure: {
        kind: 'behind',
        message:
          'Intersection falls behind one of the shots — make sure you faced the drop both times.',
      },
    };
  }

  if (t > MAX_FORWARD_DISTANCE || s > MAX_FORWARD_DISTANCE) {
    const maxDist = Math.max(t, s);
    return {
      ok: false,
      failure: {
        kind: 'too_far',
        message: `Intersection is ${Math.round(maxDist)}m away — angle between shots is too small to triangulate reliably.`,
        distance: maxDist,
      },
    };
  }

  return {
    ok: true,
    result: {
      x: a.x + t * sinA,
      z: a.z + t * cosA,
      distFromA: t,
      distFromB: s,
    },
  };
}
