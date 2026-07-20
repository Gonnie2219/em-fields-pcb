/**
 * Web Worker running the electrostatic two-solve extraction off the main
 * thread. Keeps the last converged fields per grid signature so slider drags
 * that don't change the grid (e.g. εr) warm-start and converge quickly.
 */
import { capacitancePerLength, cellField, solveLaplace } from '../physics/electrostatic';
import { buildTraceProblem, withVacuumDielectric } from '../physics/traceGeometry';
import { lineParamsFromCapacitance } from '../physics/transmissionLine';
import {
  QUALITY_TARGETS,
  type SolveRequest,
  type SolveResponse,
} from '../modules/trace-fields/solverTypes';

let cache: { key: string; phi: Float64Array; phiVac: Float64Array } | null = null;

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, g, quality } = e.data;
  const t0 = performance.now();
  const target = QUALITY_TARGETS[quality];
  const { problem, meta } = buildTraceProblem(g, target.nx, target.ny);
  const { nx, ny, dx, dy } = problem.grid;

  const key = `${g.kind}:${nx}x${ny}`;
  const warm = cache?.key === key ? cache : null;
  const real = solveLaplace(problem, { phiInit: warm?.phi });
  const vacProblem = withVacuumDielectric(problem);
  const vac = solveLaplace(vacProblem, { phiInit: warm?.phiVac });
  cache = { key, phi: real.phi, phiVac: vac.phi };

  const C = capacitancePerLength(problem, real.phi, 1);
  const C0 = capacitancePerLength(vacProblem, vac.phi, 1);
  const params = lineParamsFromCapacitance(C, C0);

  // Energy split dielectric vs air (cell-based, for the teaching readout).
  const { ex, ey } = cellField(problem.grid, real.phi);
  const ncx = nx - 1;
  const ncy = ny - 1;
  let total = 0;
  let diel = 0;
  for (let j = 0; j < ncy; j++) {
    const inDiel = g.kind === 'stripline' || j < meta.jDiel;
    for (let i = 0; i < ncx; i++) {
      const ci = j * ncx + i;
      const u = problem.epsR[ci]! * (ex[ci]! * ex[ci]! + ey[ci]! * ey[ci]!);
      total += u;
      if (inDiel) diel += u;
    }
  }

  const res: SolveResponse = {
    id,
    nx,
    ny,
    dx,
    dy,
    x0: meta.x0,
    jDiel: meta.jDiel,
    phi: real.phi,
    ...params,
    dielEnergyFraction: total > 0 ? diel / total : 0,
    iterations: real.iterations + vac.iterations,
    solveMs: performance.now() - t0,
  };
  postMessage(res); // structured clone: keeps the cached fields valid
};
