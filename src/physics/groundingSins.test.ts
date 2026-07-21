import { describe, expect, it } from 'vitest';
import { EPS_0 } from './constants';
import { interplaneCapacitancePerArea } from './planePair';
import {
  detourInductance,
  groundBounce,
  localPatchCapacitance,
  seriesCrossoverFrequency,
  slotDetourInductance,
  solveDcPlane,
  viaInductance,
  zReturn,
  type DcPlaneParams,
} from './groundingSins';

const H = 0.2e-3; // trace height
const TRACE_W = 0.3e-3;

describe('slotDetourInductance (Grover-rectangle detour estimate)', () => {
  it('slot length → 0 ⇒ ΔL → 0, and no crossing ⇒ exactly 0', () => {
    expect(slotDetourInductance(1e-6, 1e-3, 0, H, TRACE_W)).toBeLessThan(1e-12);
    expect(slotDetourInductance(0, 1e-3, 0, H, TRACE_W)).toBe(0);
    // crossing beyond the slot end: corridor not interrupted
    expect(slotDetourInductance(20e-3, 1e-3, 11e-3, H, TRACE_W)).toBe(0);
  });

  it('crossing at the slot end gives less ΔL than crossing at the center', () => {
    const atEnd = slotDetourInductance(20e-3, 1e-3, 9.5e-3, H, TRACE_W);
    const atCenter = slotDetourInductance(20e-3, 1e-3, 0, H, TRACE_W);
    expect(atEnd).toBeLessThan(atCenter);
  });

  it('ΔL is monotonically non-decreasing in slot length', () => {
    let prev = 0;
    for (const lenMm of [1, 2, 5, 10, 20, 40, 80]) {
      const L = slotDetourInductance(lenMm * 1e-3, 1e-3, 0, H, TRACE_W);
      expect(L).toBeGreaterThanOrEqual(prev);
      prev = L;
    }
    expect(prev).toBeGreaterThan(0);
  });

  it('ΔL is monotonically non-decreasing in distance-to-end', () => {
    let prev = 0;
    for (const offMm of [9.5, 8, 6, 4, 2, 0]) {
      // decreasing |offset| = increasing distance to the near end
      const L = slotDetourInductance(20e-3, 1e-3, offMm * 1e-3, H, TRACE_W);
      expect(L).toBeGreaterThanOrEqual(prev);
      prev = L;
    }
  });

  it('frozen anchor: 20 × 1 mm slot, center crossing, h = 0.2 mm ⇒ 5.567 nH', () => {
    // Derivation: a = 20/2 = 10 mm (center → end), b = 1 mm,
    // r_eff = max(w/2 = 0.15, min(3h = 0.6, b/4 = 0.25, a/4 = 2.5)) = 0.25 mm.
    // Grover rectangle, g = √(a²+b²) = 10.04988 mm (all lengths in mm):
    //   a·ln(2a/r) = 10·ln 80    = 43.8203
    //   b·ln(2b/r) = ln 8        =  2.0794
    //  −a·ln((a+g)/b) = −10·ln 20.0499 = −29.9822
    //  −b·ln((b+g)/a) = −ln 1.10499    =  −0.0998
    //   2g − 2(a+b) = 20.0998 − 22     =  −1.9003
    //   sum = 13.9174 mm ⇒ L = (µ0/π)·13.9174 mm = 4×10⁻⁷·0.0139174 = 5.5670 nH
    const L = slotDetourInductance(20e-3, 1e-3, 0, H, TRACE_W);
    expect(Math.abs(L - 5.567e-9) / 5.567e-9).toBeLessThan(0.001);
  });

  it('clamps at zero instead of going negative for tiny detours', () => {
    for (const aMm of [0.05, 0.1, 0.2, 0.5]) {
      expect(detourInductance(aMm * 1e-3, 1e-3, H, TRACE_W)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('viaInductance (Johnson & Graham)', () => {
  it('h = 1.6 mm, d = 0.25 mm ⇒ 1.36 nH within 2%', () => {
    // Independent hand computation of the cited formula:
    // h = 1.6 mm = 0.062992 in, 4h/d = 25.6, ln 25.6 = 3.24259, +1 = 4.24259,
    // L = 5.08 × 0.062992 × 4.24259 = 1.3576 nH.
    const L = viaInductance(1.6e-3, 0.25e-3);
    expect(Math.abs(L - 1.36e-9) / 1.36e-9).toBeLessThan(0.02);
  });

  it('grows with length and shrinks with diameter', () => {
    expect(viaInductance(3.2e-3, 0.25e-3)).toBeGreaterThan(viaInductance(1.6e-3, 0.25e-3));
    expect(viaInductance(1.6e-3, 0.5e-3)).toBeLessThan(viaInductance(1.6e-3, 0.25e-3));
  });
});

describe('layer-hop return impedance', () => {
  it('10 mm patch, d = 0.2 mm, εr = 4.3 ⇒ 19.0 pF, consistent with Module 3', () => {
    const C = localPatchCapacitance(4.3, 0.2e-3, 10e-3);
    // ε0·εr/d·A = 8.8542×10⁻¹²·4.3/2×10⁻⁴ × 10⁻⁴ m² = 19.04 pF
    expect(Math.abs(C - 19.0e-12) / 19.0e-12).toBeLessThan(0.01);
    expect(C).toBeCloseTo(interplaneCapacitancePerArea(4.3, 0.2e-3) * 1e-4, 20);
    expect(C).toBeCloseTo((EPS_0 * 4.3 * 1e-4) / 0.2e-3, 20);
  });

  it('19.0 pF planes + 1.36 nH stitching via cross over at ≈ 0.99 GHz', () => {
    const C = localPatchCapacitance(4.3, 0.2e-3, 10e-3);
    const L = viaInductance(1.6e-3, 0.25e-3);
    const f = seriesCrossoverFrequency(L, C);
    // 1/(2π√(1.3576 nH · 19.04 pF)) = 0.990 GHz
    expect(Math.abs(f - 0.99e9) / 0.99e9).toBeLessThan(0.03);
    // |Z| of the two branches agree at the crossover
    const zC = zReturn(f, { kind: 'planes', C });
    const zL = zReturn(f, { kind: 'via', L });
    expect(Math.abs(Math.abs(zC.im) - zL.im) / zL.im).toBeLessThan(1e-9);
  });

  it('planes are capacitive, via inductive, cap dips to its ESR at SRF', () => {
    expect(zReturn(1e8, { kind: 'planes', C: 19e-12 }).im).toBeLessThan(0);
    expect(zReturn(1e8, { kind: 'via', L: 1.36e-9 }).im).toBeGreaterThan(0);
    const spec = { C: 100e-9, esr: 0.02, esl: 0.4e-9, lMount: 1.9e-9, n: 1 };
    const srf = seriesCrossoverFrequency(spec.esl + spec.lMount, spec.C);
    const z = zReturn(srf, { kind: 'cap', spec });
    expect(z.re).toBeCloseTo(0.02, 12);
    expect(Math.abs(z.im)).toBeLessThan(1e-9);
  });
});

describe('groundBounce (re-export)', () => {
  it('ΔL = 2 nH at 50 mA/ns ⇒ 100 mV exactly', () => {
    expect(groundBounce(2e-9, 0.05, 1e-9)).toBeCloseTo(0.1, 12);
  });
});

describe('solveDcPlane (conduction analog of the SOR solver)', () => {
  const base: DcPlaneParams = {
    W: 100e-3,
    H: 60e-3,
    nx: 101,
    ny: 61,
    slots: [],
    source: { x: 10e-3, y: 30e-3 },
    sink: { x: 90e-3, y: 30e-3 },
    contactR: 2e-3,
  };

  it('conserves current: in = out within 1% (with a slot in the way)', () => {
    const res = solveDcPlane({
      ...base,
      slots: [{ x0: 49.4e-3, y0: 20e-3, x1: 50.6e-3, y1: 40e-3 }],
    });
    expect(res.residual).toBeLessThan(1e-5);
    expect(res.iSource).toBeGreaterThan(0);
    expect(Math.abs(res.iSource + res.iSink) / res.iSource).toBeLessThan(0.01);
  });

  it('a slot spanning all but a gap forces the current through the gap', () => {
    // Slot from the bottom edge to y = 52 mm: only the 8 mm gap at the top
    // conducts across x = 50 mm.
    const res = solveDcPlane({
      ...base,
      slots: [{ x0: 49.4e-3, y0: -1e-3, x1: 50.6e-3, y1: 52e-3 }],
    });
    const { nx, ny, dy } = res.grid;
    const ncx = nx - 1;
    const i = 49; // cell column with centers at x = 49.5 mm (inside the slot band)
    let total = 0;
    let gap = 0;
    for (let j = 0; j < ny - 1; j++) {
      const flux = res.jx[j * ncx + i]! * dy;
      total += flux;
      if ((j + 0.5) * dy > 52e-3) gap += flux;
    }
    expect(gap / total).toBeGreaterThan(0.98);
    // The column cut carries (approximately, via the cell-averaged J) the
    // full source current.
    expect(Math.abs(total - res.iSource) / res.iSource).toBeLessThan(0.05);
  });
});
