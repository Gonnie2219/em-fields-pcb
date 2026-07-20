import type { TraceGeometry } from '../../physics/traceGeometry';

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

export type WorkerRequest = SolveRequest | InvertRequest;

export interface InvertResponse {
  task: 'invert';
  id: number;
  tag?: string;
  /** Synthesized width [m] and the solver Z0 achieved there. */
  w: number;
  Z0: number;
}

export type WorkerResponse = SolveResponse | InvertResponse;

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
