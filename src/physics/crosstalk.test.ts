import { describe, expect, it } from 'vitest';
import {
  capacitancePerLength,
  conductorCharge,
  rectNodeMask,
  solveLaplace,
  type ElectrostaticProblem,
} from './electrostatic';
import {
  buildCoupledPairProblem,
  buildTraceProblem,
  withVacuumDielectric,
  type CoupledPairGeometry,
} from './traceGeometry';
import { lineParamsFromCapacitance } from './transmissionLine';
import {
  coupledParamsFromEvenOdd,
  fextAmplitude,
  fextWaveform,
  nextAmplitude,
  nextWaveform,
  propagationDelay,
  solveCoupledPair,
} from './crosstalk';

/** Module 6 default geometry (also used by the convergence test). */
const DEFAULT: CoupledPairGeometry = {
  kind: 'microstrip',
  w: 0.5e-3,
  t: 0.035e-3,
  h: 0.5e-3,
  s: 0.5e-3,
  epsR: 4.4,
};

/**
 * Right half of a pair problem, cut at the symmetry-plane node column
 * (x = 0): 'dirichlet0' pins the wall at φ = 0 (odd-mode E-wall),
 * 'neumann' leaves it to the solver's natural zero-flux boundary (even-mode
 * H-wall).
 */
function sliceRightHalf(
  problem: ElectrostaticProblem,
  x0: number,
  wall: 'dirichlet0' | 'neumann',
): { problem: ElectrostaticProblem; iCut: number } {
  const { nx, ny, dx, dy } = problem.grid;
  const iCut = Math.round(-x0 / dx);
  const nx2 = nx - iCut;
  const ncx = nx - 1;
  const eps = new Float64Array((nx2 - 1) * (ny - 1));
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx2 - 1; i++) eps[j * (nx2 - 1) + i] = problem.epsR[j * ncx + iCut + i]!;
  }
  const fixed = new Uint8Array(nx2 * ny);
  const fixedValue = new Float64Array(nx2 * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx2; i++) {
      fixed[j * nx2 + i] = problem.fixed[j * nx + iCut + i]!;
      fixedValue[j * nx2 + i] = problem.fixedValue[j * nx + iCut + i]!;
    }
  }
  if (wall === 'dirichlet0') {
    for (let j = 0; j < ny; j++) {
      fixed[j * nx2] = 1;
      fixedValue[j * nx2] = 0;
    }
  }
  return { problem: { grid: { nx: nx2, ny, dx, dy }, epsR: eps, fixed, fixedValue }, iCut };
}

/** Per-line modal capacitance of the half-domain problem (charge on the right trace / its V). */
function halfDomainCap(
  full: ReturnType<typeof buildCoupledPairProblem>,
  wall: 'dirichlet0' | 'neumann',
  vacuum: boolean,
): number {
  const { problem: sliced, iCut } = sliceRightHalf(full.problem, full.meta.x0, wall);
  const p = vacuum ? withVacuumDielectric(sliced) : sliced;
  const { phi } = solveLaplace(p);
  const m = full.meta;
  const mask = rectNodeMask(p.grid, m.iRight0 - iCut, m.iRight1 - iCut, m.jTrace0, m.jTrace1);
  const v = full.problem.fixedValue[m.jTrace0 * full.problem.grid.nx + m.iRight0]!;
  return conductorCharge(p, phi, mask) / v;
}

describe('conductorCharge (discrete Gauss law)', () => {
  it('single trace: Q/V equals the energy-based C′ (network identity)', () => {
    const { problem, meta } = buildTraceProblem(
      { kind: 'microstrip', w: 0.5e-3, t: 0.035e-3, h: 0.5e-3, epsR: 4.4 },
      129,
      65,
    );
    const { phi } = solveLaplace(problem, { tol: 1e-6 });
    const cEnergy = capacitancePerLength(problem, phi, 1);
    const mask = rectNodeMask(problem.grid, meta.iTrace0, meta.iTrace1, meta.jTrace0, meta.jTrace1);
    const cCharge = conductorCharge(problem, phi, mask);
    expect(Math.abs(cCharge - cEnergy) / cEnergy).toBeLessThan(1e-3);
  });
});

describe('symmetry-wall equivalence', () => {
  const oddFull = solveCoupledPair(DEFAULT, 129, 65);

  it('odd mode ≡ half domain with a Dirichlet-0 wall (Z_odd within 1%)', () => {
    const fullOdd = buildCoupledPairProblem(DEFAULT, 1, -1, 129, 65);
    const co = halfDomainCap(fullOdd, 'dirichlet0', false);
    const co0 = halfDomainCap(fullOdd, 'dirichlet0', true);
    const zOddHalf = lineParamsFromCapacitance(co, co0).Z0;
    expect(Math.abs(zOddHalf - oddFull.params.zOdd) / oddFull.params.zOdd).toBeLessThan(0.01);
  });

  it('even mode ≡ half domain with a Neumann wall (Z_even within 1%)', () => {
    const fullEven = buildCoupledPairProblem(DEFAULT, 1, 1, 129, 65);
    const ce = halfDomainCap(fullEven, 'neumann', false);
    const ce0 = halfDomainCap(fullEven, 'neumann', true);
    const zEvenHalf = lineParamsFromCapacitance(ce, ce0).Z0;
    expect(Math.abs(zEvenHalf - oddFull.params.zEven) / oddFull.params.zEven).toBeLessThan(0.01);
  });
});

describe('isolation limit (s/h = 10)', () => {
  it('Z_even and Z_odd each within 3% of the isolated single-trace Z0', () => {
    const g: CoupledPairGeometry = {
      kind: 'stripline',
      w: 0.3e-3,
      t: 0.035e-3,
      h: 0.36e-3,
      s: 3.6e-3,
      epsR: 4.4,
    };
    const pair = solveCoupledPair(g, 129, 65).params;
    // Existing single-trace path — the reference, not a re-implementation.
    const single = buildTraceProblem(
      { kind: 'stripline', w: g.w, t: g.t, h: g.h, epsR: g.epsR },
      129,
      65,
    );
    const real = solveLaplace(single.problem);
    const vacP = withVacuumDielectric(single.problem);
    const vac = solveLaplace(vacP);
    const z0 = lineParamsFromCapacitance(
      capacitancePerLength(single.problem, real.phi, 1),
      capacitancePerLength(vacP, vac.phi, 1),
    ).Z0;
    expect(Math.abs(pair.zEven - z0) / z0).toBeLessThan(0.03);
    expect(Math.abs(pair.zOdd - z0) / z0).toBeLessThan(0.03);
  });
});

describe('homogeneity theorem (stripline: Lm/Ls = Cm/Cs)', () => {
  const cases: CoupledPairGeometry[] = [
    { kind: 'stripline', w: 0.3e-3, t: 0.035e-3, h: 0.3e-3, s: 0.3e-3, epsR: 4.4 },
    { kind: 'stripline', w: 0.5e-3, t: 0.035e-3, h: 0.2e-3, s: 0.25e-3, epsR: 4.4 },
    { kind: 'stripline', w: 0.2e-3, t: 0, h: 0.4e-3, s: 0.6e-3, epsR: 3.0 },
  ];
  it('Lm/Ls matches Cm/Cs within 2% at several geometries', () => {
    for (const g of cases) {
      const p = solveCoupledPair(g, 129, 65).params;
      expect(Math.abs(p.lmLs - p.cmCs) / p.cmCs).toBeLessThan(0.02);
    }
  });
});

describe('coupling vs spacing', () => {
  it('Cm/Cs strictly decreasing in s at fixed w, h (microstrip)', () => {
    const ratios = [0.15e-3, 0.3e-3, 0.6e-3, 1.2e-3].map(
      (s) => solveCoupledPair({ ...DEFAULT, s }, 129, 65).params.cmCs,
    );
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]!).toBeLessThan(ratios[i - 1]!);
  });
});

describe('NEXT/FEXT closed forms', () => {
  const cmCs = 0.06;
  const lmLs = 0.1;
  const epsEff = 3;
  const tr = 100e-12;

  it('NEXT amplitude is length-independent once 2·TD ≥ t_r, scaled 2TD/t_r below', () => {
    const lenSat = [0.02, 0.05, 0.2].map((len) =>
      nextAmplitude(cmCs, lmLs, propagationDelay(len, epsEff), tr),
    );
    expect(lenSat[0]).toBeCloseTo(lenSat[1]!, 12);
    expect(lenSat[1]).toBeCloseTo(lenSat[2]!, 12);
    expect(lenSat[0]).toBeCloseTo(0.25 * (cmCs + lmLs), 12);
    // Short section: 2TD < tr → scaled by 2TD/tr
    const len = 2e-3;
    const td = propagationDelay(len, epsEff);
    expect(2 * td).toBeLessThan(tr);
    expect(nextAmplitude(cmCs, lmLs, td, tr)).toBeCloseTo(
      0.25 * (cmCs + lmLs) * ((2 * td) / tr),
      12,
    );
  });

  it('FEXT amplitude is linear in length (exact in the model), negative for Lm/Ls > Cm/Cs', () => {
    const a1 = fextAmplitude(cmCs, lmLs, propagationDelay(0.05, epsEff), tr);
    const a2 = fextAmplitude(cmCs, lmLs, propagationDelay(0.1, epsEff), tr);
    expect(a2 / a1).toBeCloseTo(2, 12);
    expect(a1).toBeLessThan(0);
  });

  it('waveforms: NEXT pulse lasts 2·TD, FEXT rectangle of width t_r at t = TD', () => {
    const td = 1e-9;
    expect(nextWaveform(tr + 1e-12, cmCs, lmLs, td, tr)).toBeCloseTo(
      0.25 * (cmCs + lmLs),
      12,
    );
    expect(nextWaveform(2 * td + tr + 1e-12, cmCs, lmLs, td, tr)).toBeCloseTo(0, 12);
    expect(fextWaveform(td + tr / 2, cmCs, lmLs, td, tr)).toBeCloseTo(
      fextAmplitude(cmCs, lmLs, td, tr),
      12,
    );
    expect(fextWaveform(td - 1e-12, cmCs, lmLs, td, tr)).toBe(0);
    expect(fextWaveform(td + tr + 1e-12, cmCs, lmLs, td, tr)).toBe(0);
  });

  it('coupledParamsFromEvenOdd: Z_diff = 2·Z_odd, Z_comm = Z_even/2, uncoupled ⇒ zero ratios', () => {
    const p = coupledParamsFromEvenOdd({ Ce: 1e-10, Ce0: 5e-11, Co: 1e-10, Co0: 5e-11 });
    expect(p.cmCs).toBe(0);
    expect(p.lmLs).toBe(0);
    expect(p.zDiff).toBeCloseTo(2 * p.zOdd, 12);
    expect(p.zComm).toBeCloseTo(p.zEven / 2, 12);
  });
});

describe('grid convergence', () => {
  it('doubling grid density moves Z_odd by < 2% at the default geometry', () => {
    // Targets chosen so nw is exactly 8 → 16 cells across the trace and the
    // meshed spacing sActual is identical at both densities (no snap noise):
    // boxW = 2w + s + 16·max(w,h) = 9.5 mm, nxTarget−1 = k·boxW/w.
    const coarse = solveCoupledPair(DEFAULT, 153, 65);
    const fine = solveCoupledPair(DEFAULT, 305, 129);
    expect(coarse.meta.sActual).toBeCloseTo(fine.meta.sActual, 12);
    expect(
      Math.abs(fine.params.zOdd - coarse.params.zOdd) / coarse.params.zOdd,
    ).toBeLessThan(0.02);
  });
});
