import { describe, expect, it } from 'vitest';
import { EPS_0 } from './constants';
import {
  capacitancePerLength,
  solveLaplace,
  type ElectrostaticProblem,
} from './electrostatic';

/**
 * Parallel-plate problem: full-width Dirichlet plates top (V) and bottom (0)
 * with Neumann sides. The side boundaries mirror the structure, so this is
 * the w/d → ∞ (≥ 20 by construction) limit with no fringing and the exact
 * answer is C′ = ε0·εr·w/d.
 */
function parallelPlate(nxNodes: number, nyNodes: number, wOverD: number, epsR: number) {
  const d = 1e-3;
  const w = wOverD * d;
  const grid = { nx: nxNodes, ny: nyNodes, dx: w / (nxNodes - 1), dy: d / (nyNodes - 1) };
  const eps = new Float64Array((nxNodes - 1) * (nyNodes - 1)).fill(epsR);
  const fixed = new Uint8Array(nxNodes * nyNodes);
  const fixedValue = new Float64Array(nxNodes * nyNodes);
  fixed.fill(1, 0, nxNodes);
  fixed.fill(1, (nyNodes - 1) * nxNodes);
  fixedValue.fill(1, (nyNodes - 1) * nxNodes);
  const problem: ElectrostaticProblem = { grid, epsR: eps, fixed, fixedValue };
  return { problem, exact: (EPS_0 * epsR * w) / d };
}

describe('solveLaplace + capacitancePerLength (parallel plate sanity)', () => {
  it('matches C′ = ε0·εr·w/d within 1% for a wide plate (w/d = 20), εr = 1', () => {
    const { problem, exact } = parallelPlate(101, 21, 20, 1);
    const { phi, residual } = solveLaplace(problem);
    expect(residual).toBeLessThan(1e-5);
    const C = capacitancePerLength(problem, phi, 1);
    expect(Math.abs(C - exact) / exact).toBeLessThan(0.01);
  });

  it('scales linearly with εr (εr = 4.4)', () => {
    const { problem, exact } = parallelPlate(101, 21, 20, 4.4);
    const { phi } = solveLaplace(problem);
    const C = capacitancePerLength(problem, phi, 1);
    expect(Math.abs(C - exact) / exact).toBeLessThan(0.01);
  });

  it('recovers the analytic linear potential profile', () => {
    const { problem } = parallelPlate(41, 41, 2, 3);
    const { phi } = solveLaplace(problem, { tol: 1e-7 });
    const { nx, ny } = problem.grid;
    // φ should be y/d, independent of x
    const mid = Math.floor(nx / 2);
    for (let j = 0; j < ny; j++) {
      expect(phi[j * nx + mid]!).toBeCloseTo(j / (ny - 1), 4);
    }
  });

  it('honors a two-dielectric stack (series capacitors)', () => {
    // Bottom half εr = 4, top half εr = 1 between plates 1 mm apart:
    // C′ = w·(ε0/d)·2·(4·1)/(4+1)·... series: C = ε0·w / (d1/ε1 + d2/ε2)
    const { problem } = parallelPlate(51, 41, 10, 1);
    const { nx, ny } = problem.grid;
    const ncx = nx - 1;
    const ncy = ny - 1;
    for (let j = 0; j < ncy; j++) {
      problem.epsR.fill(j < ncy / 2 ? 4 : 1, j * ncx, (j + 1) * ncx);
    }
    const d = 1e-3;
    const w = 10 * d;
    const exact = (EPS_0 * w) / (d / 2 / 4 + d / 2 / 1);
    const { phi } = solveLaplace(problem, { tol: 1e-6 });
    const C = capacitancePerLength(problem, phi, 1);
    expect(Math.abs(C - exact) / exact).toBeLessThan(0.01);
  });
});
