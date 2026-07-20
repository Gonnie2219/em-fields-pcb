import { describe, expect, it } from 'vitest';
import { skinDepth } from './skinDepth';

describe('skinDepth (copper reference values)', () => {
  it('is ≈ 65–66 µm at 1 MHz', () => {
    const d = skinDepth(1e6);
    expect(d).toBeGreaterThan(64e-6);
    expect(d).toBeLessThan(67e-6);
    // Tighter check against the analytic value √(2·1.68e-8/(2π·1e6·µ0)) = 65.2 µm
    expect(d).toBeCloseTo(65.2e-6, 7);
  });

  it('is ≈ 2.06 µm at 1 GHz', () => {
    const d = skinDepth(1e9);
    expect(d).toBeCloseTo(2.06e-6, 8);
  });

  it('scales as 1/√f', () => {
    expect(skinDepth(1e6) / skinDepth(1e8)).toBeCloseTo(10, 6);
  });
});
