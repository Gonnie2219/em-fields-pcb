import type { TraceGeometry } from '../../physics/traceGeometry';

export type Quality = 'draft' | 'balanced' | 'fine';

/** Approximate node-count targets per quality setting (see buildTraceProblem). */
export const QUALITY_TARGETS: Record<Quality, { nx: number; ny: number }> = {
  draft: { nx: 129, ny: 65 },
  balanced: { nx: 257, ny: 129 },
  fine: { nx: 385, ny: 193 },
};

export interface SolveRequest {
  id: number;
  g: TraceGeometry;
  quality: Quality;
}

export interface SolveResponse {
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
