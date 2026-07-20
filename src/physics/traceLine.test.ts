import { describe, expect, it } from 'vitest';
import { capacitancePerLength, solveLaplace } from './electrostatic';
import { microstripHammerstadJensen } from './hammerstadJensen';
import { buildTraceProblem, withVacuumDielectric, type TraceGeometry } from './traceGeometry';
import { lineParamsFromCapacitance, type LineParams } from './transmissionLine';

/** Run the two-solve quasi-TEM extraction, as the worker does. */
function solveTrace(g: TraceGeometry, nxTarget = 257, nyTarget = 129): LineParams {
  const { problem } = buildTraceProblem(g, nxTarget, nyTarget);
  const real = solveLaplace(problem);
  expect(real.residual).toBeLessThan(1e-5);
  const vacuumProblem = withVacuumDielectric(problem);
  const vac = solveLaplace(vacuumProblem);
  expect(vac.residual).toBeLessThan(1e-5);
  const C = capacitancePerLength(problem, real.phi, 1);
  const C0 = capacitancePerLength(vacuumProblem, vac.phi, 1);
  return lineParamsFromCapacitance(C, C0);
}

const TIMEOUT = 120_000;

describe('microstrip solver vs Hammerstad–Jensen closed form (t = 0)', () => {
  it(
    'w/h = 1, εr = 4.4: Z0 and ε_eff within 5%',
    () => {
      const hj = microstripHammerstadJensen(1, 4.4);
      const p = solveTrace({ kind: 'microstrip', w: 1e-3, t: 0, h: 1e-3, epsR: 4.4 });
      expect(Math.abs(p.Z0 - hj.Z0) / hj.Z0).toBeLessThan(0.05);
      expect(Math.abs(p.epsEff - hj.epsEff) / hj.epsEff).toBeLessThan(0.05);
    },
    TIMEOUT,
  );

  it(
    'w/h = 2, εr = 4.4: Z0 and ε_eff within 5%',
    () => {
      const hj = microstripHammerstadJensen(2, 4.4);
      const p = solveTrace({ kind: 'microstrip', w: 2e-3, t: 0, h: 1e-3, epsR: 4.4 });
      expect(Math.abs(p.Z0 - hj.Z0) / hj.Z0).toBeLessThan(0.05);
      expect(Math.abs(p.epsEff - hj.epsEff) / hj.epsEff).toBeLessThan(0.05);
    },
    TIMEOUT,
  );

  it('H-J reference values are sane (w/h = 2, εr = 4.4 ≈ 49 Ω)', () => {
    const hj = microstripHammerstadJensen(2, 4.4);
    expect(hj.Z0).toBeGreaterThan(45);
    expect(hj.Z0).toBeLessThan(53);
    expect(hj.epsEff).toBeGreaterThan(3.1);
    expect(hj.epsEff).toBeLessThan(3.6);
  });
});

describe('ε_eff bounds', () => {
  it(
    'microstrip: 1 < ε_eff < εr (field partly in air)',
    () => {
      const p = solveTrace({ kind: 'microstrip', w: 1e-3, t: 0, h: 0.5e-3, epsR: 4.4 });
      expect(p.epsEff).toBeGreaterThan(1);
      expect(p.epsEff).toBeLessThan(4.4);
    },
    TIMEOUT,
  );

  it(
    'stripline: ε_eff ≈ εr (homogeneous dielectric)',
    () => {
      const p = solveTrace({ kind: 'stripline', w: 1e-3, t: 0, h: 0.5e-3, epsR: 4.4 });
      expect(p.epsEff).toBeCloseTo(4.4, 3);
    },
    TIMEOUT,
  );
});

describe('grid convergence', () => {
  it(
    'doubling grid density changes Z0 by < 2% at the default geometry',
    () => {
      const g: TraceGeometry = { kind: 'microstrip', w: 1e-3, t: 0.035e-3, h: 0.5e-3, epsR: 4.4 };
      const base = solveTrace(g, 257, 129);
      const dense = solveTrace(g, 513, 257);
      expect(Math.abs(dense.Z0 - base.Z0) / base.Z0).toBeLessThan(0.02);
    },
    TIMEOUT,
  );
});
