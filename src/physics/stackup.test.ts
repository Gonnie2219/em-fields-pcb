import { describe, expect, it } from 'vitest';
import { capacitancePerLength, solveLaplace } from './electrostatic';
import { ellipticK, striplineZ0Cohn } from './cohnStripline';
import { interplaneCapacitancePerArea } from './planePair';
import { buildTraceProblem, withVacuumDielectric, type TraceGeometry } from './traceGeometry';
import { lineParamsFromCapacitance, type LineParams } from './transmissionLine';
import { widthForZ0 } from './widthSynthesis';

/** Two-solve quasi-TEM extraction (same as the worker path). */
function solveTrace(g: TraceGeometry, nxTarget = 257, nyTarget = 129): LineParams {
  const { problem } = buildTraceProblem(g, nxTarget, nyTarget);
  const real = solveLaplace(problem);
  expect(real.residual).toBeLessThan(1e-5);
  const vacuumProblem = withVacuumDielectric(problem);
  const vac = solveLaplace(vacuumProblem);
  expect(vac.residual).toBeLessThan(1e-5);
  return lineParamsFromCapacitance(
    capacitancePerLength(problem, real.phi, 1),
    capacitancePerLength(vacuumProblem, vac.phi, 1),
  );
}

const TIMEOUT = 120_000;

describe('Cohn exact stripline reference', () => {
  it('elliptic K sanity: K(0) = π/2, K grows with k', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 12);
    expect(ellipticK(0.9)).toBeGreaterThan(ellipticK(0.5));
  });

  it('Z0(w/b = 1, εr = 1) ≈ 65.4 Ω (vs Pozar approx 30π·b/(w_eff + 0.441b) ≈ 65)', () => {
    const z = striplineZ0Cohn(1e-3, 1e-3, 1);
    expect(z).toBeGreaterThan(64);
    expect(z).toBeLessThan(67);
  });
});

describe('stripline solver vs Cohn exact (t = 0, εr = 4.4)', () => {
  const b = 1e-3;
  for (const wOverB of [0.5, 1.0]) {
    it(
      `w/b = ${wOverB}: Z0 within 3%`,
      () => {
        const exact = striplineZ0Cohn(wOverB * b, b, 4.4);
        const p = solveTrace({ kind: 'stripline', w: wOverB * b, t: 0, h: b / 2, epsR: 4.4 });
        expect(Math.abs(p.Z0 - exact) / exact).toBeLessThan(0.03);
      },
      TIMEOUT,
    );
  }
});

describe('offset stripline', () => {
  const base: TraceGeometry = { kind: 'stripline', w: 1e-3, t: 0.035e-3, h: 0.5e-3, epsR: 4.4 };

  it(
    'h_above = h_below matches symmetric stripline within 1%',
    () => {
      const sym = solveTrace(base);
      const off = solveTrace({ ...base, kind: 'offset-stripline', hAbove: 0.5e-3 });
      expect(Math.abs(off.Z0 - sym.Z0) / sym.Z0).toBeLessThan(0.01);
    },
    TIMEOUT,
  );

  it(
    'moving either plane closer lowers Z0',
    () => {
      const sym = solveTrace({ ...base, kind: 'offset-stripline', hAbove: 0.5e-3 });
      const lowerCloser = solveTrace({ ...base, kind: 'offset-stripline', h: 0.3e-3, hAbove: 0.5e-3 });
      const upperCloser = solveTrace({ ...base, kind: 'offset-stripline', hAbove: 0.3e-3 });
      expect(lowerCloser.Z0).toBeLessThan(sym.Z0);
      expect(upperCloser.Z0).toBeLessThan(sym.Z0);
    },
    TIMEOUT,
  );
});

describe('interplane capacitance', () => {
  it('matches ε0·εr/d exactly', () => {
    const C = interplaneCapacitancePerArea(4.4, 0.2e-3);
    expect(C).toBeCloseTo((8.8541878128e-12 * 4.4) / 0.2e-3, 18);
    // 0.2 mm FR4 pair ≈ 19.5 pF/cm²
    expect(C * 1e12 * 1e-4).toBeCloseTo(19.48, 1);
  });
});

describe('50 Ω width synthesis round-trip', () => {
  it(
    '|Z0(w_found) − 50| < 1 Ω on the 4-layer good preset outer layer',
    () => {
      // 4-layer "good SI" outer layer: microstrip, h = 0.2 mm prepreg, 35 µm copper
      const template: TraceGeometry = {
        kind: 'microstrip',
        w: 0.3e-3,
        t: 0.035e-3,
        h: 0.2e-3,
        epsR: 4.4,
      };
      const numericZ0 = (w: number) => solveTrace({ ...template, w }).Z0;
      const { w } = widthForZ0(template, 50, numericZ0, 3);
      const check = numericZ0(w); // independent verification solve
      expect(Math.abs(check - 50)).toBeLessThan(1);
    },
    TIMEOUT,
  );
});
