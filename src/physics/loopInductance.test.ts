import { describe, expect, it } from 'vitest';
import { MU_0, RHO_CU } from './constants';
import { skinDepth as skinDepthModule1 } from './skinDepth';
import {
  effectiveStripRadius,
  groundBounce,
  internalInductanceLF,
  loopCrossoverFrequency,
  mountingLoopInductance,
  rectLoopInductance,
  skinDepth,
  traceOverPlaneInductancePerMeterHJ,
  traceOverPlaneInductancePerMeterPP,
  wireLoopImpedance,
  wirePairInductancePerMeter,
  wirePairInductancePerMeterLog,
  wireResistance,
} from './loopInductance';

describe('rectLoopInductance (Rosa/Grover rectangle)', () => {
  it('square loop s = 10 cm, r = 0.5 mm: within 0.5% of 362 nH', () => {
    // Hand evaluation of the square-loop reduction L = (2µ0·s/π)[ln(s/r) − 0.77401]:
    // 2µ0·s/π = 2·(4π×10⁻⁷)·0.1/π = 8×10⁻⁸; ln(0.1/5×10⁻⁴) = ln 200 = 5.29832;
    // L = 8×10⁻⁸·(5.29832 − 0.77401) = 8×10⁻⁸·4.52431 = 361.94 nH.
    const L = rectLoopInductance(0.1, 0.1, 0.5e-3);
    expect(Math.abs(L - 361.94e-9) / 361.94e-9).toBeLessThan(0.005);
  });

  it('internal-inductance toggle adds exactly µ0·(0.4 m)/(8π) = 20.0 nH', () => {
    const perimeter = 0.4;
    expect(internalInductanceLF(perimeter)).toBeCloseTo((MU_0 * 0.4) / (8 * Math.PI), 20);
    expect(internalInductanceLF(perimeter)).toBeCloseTo(20e-9, 12);
  });

  it('is symmetric in a and b', () => {
    expect(rectLoopInductance(0.2, 0.05, 1e-3)).toBeCloseTo(
      rectLoopInductance(0.05, 0.2, 1e-3),
      18,
    );
  });
});

describe('wirePairInductancePerMeter (two-wire line)', () => {
  it('D = 10 mm, r = 0.5 mm: 1.197 µH/m within 0.5%', () => {
    // (µ0/π)·acosh(10) = 4×10⁻⁷·2.9932 = 1.1973 µH/m.
    const L = wirePairInductancePerMeter(10e-3, 0.5e-3);
    expect(Math.abs(L - 1.197e-6) / 1.197e-6).toBeLessThan(0.005);
  });

  it('ln(D/r) form within 1% of the acosh form for all D/(2r) ≥ 10', () => {
    const r = 0.5e-3;
    for (const ratio of [10, 15, 20, 50, 100, 500]) {
      const D = 2 * r * ratio;
      const exact = wirePairInductancePerMeter(D, r);
      const approx = wirePairInductancePerMeterLog(D, r);
      expect(Math.abs(approx - exact) / exact).toBeLessThan(0.01);
    }
  });
});

describe('trace over plane: parallel-plate vs Hammerstad–Jensen', () => {
  it('H-J L′ strictly below µ0·h/w for all w/h (fringing reduces L)', () => {
    const h = 0.2e-3;
    for (const u of [0.5, 1, 2, 5, 10, 20, 50, 100]) {
      const w = u * h;
      expect(traceOverPlaneInductancePerMeterHJ(h, w)).toBeLessThan(
        traceOverPlaneInductancePerMeterPP(h, w),
      );
    }
  });

  it('within 15% of µ0·h/w at w/h = 20 and within 5% at w/h = 100', () => {
    const h = 0.2e-3;
    const rel = (u: number) => {
      const pp = traceOverPlaneInductancePerMeterPP(h, u * h);
      return (pp - traceOverPlaneInductancePerMeterHJ(h, u * h)) / pp;
    };
    expect(rel(20)).toBeLessThan(0.15);
    expect(rel(100)).toBeLessThan(0.05);
  });
});

describe('mountingLoopInductance (rectangle estimate)', () => {
  const base = { span: 2e-3, escape: 0, traceW: 0.3e-3, traceT: 0.035e-3 };

  it('2 mm span at 0.2 mm depth lands in 0.4–0.9 nH', () => {
    const L = mountingLoopInductance({ ...base, depth: 0.2e-3 });
    expect(L).toBeGreaterThan(0.4e-9);
    expect(L).toBeLessThan(0.9e-9);
  });

  it('same span at 1.6 mm depth is 4–6× larger', () => {
    const ratio =
      mountingLoopInductance({ ...base, depth: 1.6e-3 }) /
      mountingLoopInductance({ ...base, depth: 0.2e-3 });
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(6);
  });

  it('r_eff of a 0.3 × 0.035 mm strip is 0.2235·(w + t)', () => {
    expect(effectiveStripRadius(0.3e-3, 0.035e-3)).toBeCloseTo(0.2235 * 0.335e-3, 18);
  });
});

describe('groundBounce', () => {
  it('5 nH, 0.32 A, 1 ns → exactly 1.600 V', () => {
    expect(groundBounce(5e-9, 0.32, 1e-9)).toBeCloseTo(1.6, 9);
  });
});

describe('wireResistance and loop crossover', () => {
  const perimeter = 0.4;
  const r = 0.5e-3;

  it('low f: equals the DC value ρ·l/(π·r²)', () => {
    const rdc = (RHO_CU * perimeter) / (Math.PI * r * r);
    expect(wireResistance(10, perimeter, r)).toBeCloseTo(rdc, 12);
  });

  it('high f: equals the shell value ρ·l/(π(r² − (r−δ)²))', () => {
    const f = 1e8;
    const d = skinDepthModule1(f);
    const shell = (RHO_CU * perimeter) / (Math.PI * (r * r - (r - d) ** 2));
    expect(wireResistance(f, perimeter, r)).toBeCloseTo(shell, 12);
    expect(d).toBeLessThan(r);
  });

  it('default wire loop f_c matches R_dc/(2πL) ≈ 3.8 kHz', () => {
    // R_dc = 1.68×10⁻⁸·0.4/(π·(5×10⁻⁴)²) = 8.556 mΩ; L_ext = 361.94 nH;
    // f_c = R_dc/(2πL) = 3.76 kHz — and δ(3.8 kHz) ≈ 1.06 mm > r, so the
    // wire is still in its DC-resistance regime at the crossover.
    const L = rectLoopInductance(0.1, 0.1, r);
    const rdc = (RHO_CU * perimeter) / (Math.PI * r * r);
    const fc = loopCrossoverFrequency(perimeter, r, L);
    const expected = rdc / (2 * Math.PI * L);
    expect(Math.abs(fc - expected) / expected).toBeLessThan(0.001);
    expect(fc).toBeGreaterThan(3.5e3);
    expect(fc).toBeLessThan(4.1e3);
  });

  it('|Z| at the crossover is √2 × R', () => {
    const L = rectLoopInductance(0.1, 0.1, r);
    const fc = loopCrossoverFrequency(perimeter, r, L);
    const z = wireLoopImpedance(fc, perimeter, r, L);
    expect(z.mag / z.R).toBeCloseTo(Math.SQRT2, 3);
  });
});

describe('skin-depth import', () => {
  it('re-export is bit-identical to Module 1’s function (same reference)', () => {
    expect(skinDepth).toBe(skinDepthModule1);
    expect(skinDepth(1e6)).toBe(skinDepthModule1(1e6));
  });
});
