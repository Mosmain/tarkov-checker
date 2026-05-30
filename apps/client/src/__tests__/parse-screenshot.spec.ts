import { describe, it, expect } from 'vitest';
import { parseScreenshotFilename, quaternionToYawDegrees } from '@shared/parse-screenshot';

describe('parseScreenshotFilename', () => {
  it('extracts position and orientation from a typical Tarkov PrintScreen name', () => {
    const result = parseScreenshotFilename(
      '2024-04-12[12-34-56]_-15.4, 1.5, -23.8_-0.1, 0.7, -0.0, 0.7_75 (0).png',
    );
    expect(result?.position).toEqual({ x: -15.4, y: 1.5, z: -23.8 });
    expect(result?.orientation).toEqual({ qx: -0.1, qy: 0.7, qz: -0.0, qw: 0.7 });
  });

  it('works with a full Windows path', () => {
    const result = parseScreenshotFilename(
      'C:\\Users\\mosma\\Documents\\Escape from Tarkov\\Screenshots\\2024-04-12[12-34-56]_200.5, 1.5, -100.0_0,0,0,1_75 (0).png',
    );
    expect(result?.position).toEqual({ x: 200.5, y: 1.5, z: -100.0 });
    expect(result?.orientation).toEqual({ qx: 0, qy: 0, qz: 0, qw: 1 });
  });

  it('returns null for non-png files', () => {
    expect(
      parseScreenshotFilename('2024-04-12[12-34-56]_15.4, 1.5, -23.8_0,0,0,1_75 (0).jpg'),
    ).toBeNull();
  });

  it('returns null when no position triple is present', () => {
    expect(parseScreenshotFilename('vacation 2024.png')).toBeNull();
  });

  it('handles integer-only coordinates and yields null orientation when the quaternion is missing', () => {
    const result = parseScreenshotFilename('2024-04-12[12-34-56]_10, -5, 100_irrelevant.png');
    expect(result?.position).toEqual({ x: 10, y: -5, z: 100 });
    expect(result?.orientation).toBeNull();
  });
});

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
