import { describe, expect, it } from 'vitest';
import {
  fractionWithin,
  hfFraction,
  returnCurrentDensity,
  returnCurrentDensityDC,
  returnCurrentDensityHF,
  returnCurrentDensityWithSlot,
  returnSpread,
} from './returnCurrent';

/** Trapezoidal numerical integration of fn over [a, b] with n steps. */
function integrate(fn: (x: number) => number, a: number, b: number, n = 20000): number {
  const dx = (b - a) / n;
  let sum = 0.5 * (fn(a) + fn(b));
  for (let i = 1; i < n; i++) sum += fn(a + i * dx);
  return sum * dx;
}

const h = 0.5e-3; // 0.5 mm

describe('returnCurrentDensityHF', () => {
  it('numerically integrates to ≈ I over a wide plane', () => {
    // ±500h captures all but (2/π)·atan(∞)-(2/π)·atan(500) ≈ 0.13 % of I
    const total = integrate((x) => returnCurrentDensityHF(x, h, 1), -500 * h, 500 * h);
    expect(total).toBeCloseTo(1, 2);
  });

  it('has FWHM = 2h (half maximum at x = ±h)', () => {
    const peak = returnCurrentDensityHF(0, h);
    expect(returnCurrentDensityHF(h, h)).toBeCloseTo(peak / 2, 6);
    expect(returnCurrentDensityHF(-h, h)).toBeCloseTo(peak / 2, 6);
  });

  it('peaks at I/(π·h) under the trace', () => {
    expect(returnCurrentDensityHF(0, h, 2)).toBeCloseTo(2 / (Math.PI * h), 6);
  });
});

describe('returnCurrentDensityDC', () => {
  it('is uniform I/W on the plane and 0 outside', () => {
    const W = 20e-3;
    expect(returnCurrentDensityDC(0, W, 1)).toBeCloseTo(1 / W, 9);
    expect(returnCurrentDensityDC(0.4 * W, W, 1)).toBeCloseTo(1 / W, 9);
    expect(returnCurrentDensityDC(0.6 * W, W, 1)).toBe(0);
  });
});

describe('hfFraction (logistic blend)', () => {
  it('is ≈ 0 at 10 Hz and ≈ 1 at 1 GHz', () => {
    expect(hfFraction(10)).toBeLessThan(0.02);
    expect(hfFraction(1e9)).toBeGreaterThan(0.99);
  });

  it('is 0.5 at the 10 kHz center', () => {
    expect(hfFraction(1e4)).toBeCloseTo(0.5, 6);
  });

  it('spans the transition over roughly 100 Hz – 1 MHz', () => {
    expect(hfFraction(100)).toBeLessThan(0.1);
    expect(hfFraction(1e6)).toBeGreaterThan(0.9);
  });
});

describe('fractionWithin', () => {
  const wide = { h, W: 1000 * h, f: 1e9 };

  it('≈ 79.5 % of HF return current flows within ±3h (wide plane)', () => {
    // (2/π)·atan(3) = 0.7952, slightly renormalized by the finite plane
    expect(fractionWithin(3 * h, wide)).toBeCloseTo(0.7952, 2);
  });

  it('matches numerical integration of the blended density at 10 kHz', () => {
    const p = { h, W: 20e-3, f: 1e4 };
    const num =
      integrate((x) => returnCurrentDensity(x, p), -3 * h, 3 * h) /
      integrate((x) => returnCurrentDensity(x, p), -p.W / 2, p.W / 2);
    expect(fractionWithin(3 * h, p)).toBeCloseTo(num, 3);
  });

  it('is proportional to window width at DC', () => {
    const p = { h, W: 20e-3, f: 1 };
    expect(fractionWithin(5e-3, p)).toBeCloseTo(0.5, 2);
  });
});

describe('returnSpread (qualitative loop indicator)', () => {
  it('is much smaller at HF than at DC (current crowds under trace)', () => {
    const W = 40e-3;
    expect(returnSpread({ h, W, f: 1e9 })).toBeLessThan(returnSpread({ h, W, f: 1 }));
  });

  it('equals W/4 in the DC limit', () => {
    const W = 40e-3;
    expect(returnSpread({ h, W, f: 1 })).toBeCloseTo(W / 4, 4);
  });
});

describe('returnCurrentDensityWithSlot (schematic model)', () => {
  const p = { h, W: 20e-3, f: 1e9 };
  const slot = 4e-3;

  it('carries no current inside the slot', () => {
    expect(returnCurrentDensityWithSlot(0, p, slot)).toBe(0);
    expect(returnCurrentDensityWithSlot(slot / 2 - 1e-6, p, slot)).toBe(0);
  });

  it('approximately conserves total current (lobes re-deposit removed current)', () => {
    const withSlot = integrate((x) => returnCurrentDensityWithSlot(x, p, slot), -p.W / 2, p.W / 2);
    const without = integrate((x) => returnCurrentDensity(x, p), -p.W / 2, p.W / 2);
    expect(withSlot / without).toBeGreaterThan(0.9);
    expect(withSlot / without).toBeLessThan(1.1);
  });
});
