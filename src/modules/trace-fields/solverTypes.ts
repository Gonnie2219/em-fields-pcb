import type { CoupledPairGeometry, TraceGeometry } from '../../physics/traceGeometry';
import type { CoupledPairParams } from '../../physics/crosstalk';

export type Quality = 'draft' | 'balanced' | 'fine';

/** Approximate node-count targets per quality setting (see buildTraceProblem). */
export const QUALITY_TARGETS: Record<Quality, { nx: number; ny: number }> = {
  draft: { nx: 129, ny: 65 },
  balanced: { nx: 257, ny: 129 },
  fine: { nx: 385, ny: 193 },
};

export interface SolveRequest {
  task?: 'solve';
  id: number;
  g: TraceGeometry;
  quality: Quality;
  /** Opaque caller key, echoed back in the response (cache addressing). */
  tag?: string;
}

/** Inverse problem: find w for a target Z0 (≤ 3 solver refinements). */
export interface InvertRequest {
  task: 'invert';
  id: number;
  /** Geometry template; w is ignored. */
  g: TraceGeometry;
  quality: Quality;
  targetZ0: number;
  tag?: string;
}

/** Coupled-pair analysis (Module 6): even/odd/aggressor solves + isolated line. */
export interface PairRequest {
  task: 'pair';
  id: number;
  g: CoupledPairGeometry;
  quality: Quality;
  tag?: string;
}

/** Coupling-vs-spacing sweep at a fixed coarse grid (drag-release only). */
export interface PairSweepRequest {
  task: 'pairSweep';
  id: number;
  /** Geometry template; s is taken from `spacings`. */
  g: CoupledPairGeometry;
  spacings: number[];
  tag?: string;
}

export type WorkerRequest = SolveRequest | InvertRequest | PairRequest | PairSweepRequest;

export interface InvertResponse {
  task: 'invert';
  id: number;
  tag?: string;
  /** Synthesized width [m] and the solver Z0 achieved there. */
  w: number;
  Z0: number;
}

export interface PairResponse {
  task: 'pair';
  id: number;
  tag?: string;
  /** Grid of the real-dielectric solves, for rendering overlays. */
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  /** x of node i = 0 [m]; the symmetry plane between the traces is x = 0. */
  x0: number;
  jDiel: number;
  /** Edge-to-edge spacing actually meshed [m]. */
  sActual: number;
  /** Real-dielectric fields for the three excitations. */
  phiAggressor: Float64Array;
  phiEven: Float64Array;
  phiOdd: Float64Array;
  pair: CoupledPairParams;
  /** Isolated single-trace parameters (same w, t, h, εr; Module 2's path). */
  isoZ0: number;
  isoEpsEff: number;
  iterations: number;
  solveMs: number;
}

export interface PairSweepResponse {
  task: 'pairSweep';
  id: number;
  tag?: string;
  /** Meshed spacings [m] and the coupling ratios at each. */
  sActual: number[];
  cmCs: number[];
  lmLs: number[];
}

export type WorkerResponse = SolveResponse | InvertResponse | PairResponse | PairSweepResponse;

export interface SolveResponse {
  task?: 'solve';
  tag?: string;
  id: number;
  /** Grid of the dielectric solve, for rendering overlays. */
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  /** x of node i = 0 [m]; trace centerline at x = 0, plane at y = 0. */
  x0: number;
  /** Node row of the dielectric top surface / trace bottom. */
  jDiel: number;
  phi: Float64Array;
  /** Line parameters from the two-solve method (SI). */
  C: number;
  C0: number;
  L: number;
  Z0: number;
  epsEff: number;
  vP: number;
  /** Fraction of field energy stored inside the dielectric (cell-based). */
  dielEnergyFraction: number;
  iterations: number;
  solveMs: number;
}
