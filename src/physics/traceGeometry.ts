/**
 * Grid builder for single-trace cross-sections (microstrip / stripline) on
 * the geometry-agnostic electrostatic solver. Module 3 (stackup explorer)
 * should add its own builders against the same ElectrostaticProblem type.
 *
 * Conventions: trace centered at x = 0; y = 0 is the bottom ground plane.
 * Microstrip: dielectric 0 ≤ y ≤ h, trace at y = h (thickness t upward), air
 * above, Dirichlet 0 V bottom row, Neumann on the other three sides, side and
 * top margins ≥ 8·max(w, h) so the open boundary doesn't distort the fields.
 * Stripline: trace centered between two Dirichlet 0 V planes with clearance h
 * above and below, dielectric everywhere; side margin ≥ 3 plane spacings
 * (fields decay as exp(−π|x|/b) between planes).
 */
import type { ElectrostaticProblem } from './electrostatic';

export type TraceKind = 'microstrip' | 'stripline';

export interface TraceGeometry {
  kind: TraceKind;
  /** Trace width [m]. */
  w: number;
  /** Trace thickness [m]; 0 → single node row. */
  t: number;
  /** Microstrip: dielectric height under the trace. Stripline: trace-to-plane clearance. [m] */
  h: number;
  /** Dielectric relative permittivity. */
  epsR: number;
}

export interface TraceProblemMeta {
  /** Trace node range, inclusive. */
  iTrace0: number;
  iTrace1: number;
  jTrace0: number;
  jTrace1: number;
  /** Node row of the (microstrip) dielectric top surface = jTrace0. */
  jDiel: number;
  /** x of node i = 0 [m] (trace centerline at x = 0). */
  x0: number;
}

const MAX_TRACE_CELLS = 160;
const MAX_MARGIN_CELLS = 288;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Build the Dirichlet/εr grid for a trace geometry. nxTarget/nyTarget set the
 * approximate node counts (the "quality" knob); the actual grid snaps the
 * trace edges and the dielectric interface onto node lines, and caps the cell
 * aspect ratio at ~2.5 to keep SOR convergence healthy.
 */
export function buildTraceProblem(
  g: TraceGeometry,
  nxTarget = 257,
  nyTarget = 129,
): { problem: ElectrostaticProblem; meta: TraceProblemMeta } {
  const { kind, w, t, h, epsR } = g;
  const margin = kind === 'microstrip' ? 8 * Math.max(w, h) : Math.max(3 * (2 * h + t), w);
  const boxW = w + 2 * margin;
  const boxH = kind === 'microstrip' ? h + t + 8 * Math.max(w, h) : 2 * h + t;

  const dxT = boxW / (nxTarget - 1);
  const nw = clamp(Math.round(w / dxT), 6, MAX_TRACE_CELLS);
  const dx = w / nw;
  const nside = Math.min(Math.ceil(margin / dx), MAX_MARGIN_CELLS);
  const nx = nw + 2 * nside + 1;

  const dyT = boxH / (nyTarget - 1);
  let nh = clamp(Math.round(h / dyT), 4, MAX_TRACE_CELLS);
  // Cap cell anisotropy (dx/dy) at 2.5 where the minimum resolution allows.
  nh = Math.max(4, Math.min(nh, Math.ceil(h / (dx / 2.5))));
  // A finite trace thickness must be resolvable (dy ≤ ~t), or the modeled
  // thickness nt·dy quantizes far from t and Z0 jumps between grid densities.
  if (t > 0) nh = Math.min(Math.max(nh, Math.ceil(h / t)), MAX_TRACE_CELLS);
  const dy = h / nh;
  const nt = t > 0 ? Math.max(1, Math.round(t / dy)) : 0;
  const ntop =
    kind === 'microstrip'
      ? Math.min(Math.ceil((8 * Math.max(w, h)) / dy), MAX_MARGIN_CELLS)
      : nh;
  const ny = nh + nt + ntop + 1;

  const ncx = nx - 1;
  const ncy = ny - 1;
  const eps = new Float64Array(ncx * ncy);
  for (let j = 0; j < ncy; j++) {
    const e = kind === 'stripline' || j < nh ? epsR : 1;
    eps.fill(e, j * ncx, (j + 1) * ncx);
  }

  const fixed = new Uint8Array(nx * ny);
  const fixedValue = new Float64Array(nx * ny);
  // Bottom plane at 0 V; stripline also has a top plane at 0 V.
  fixed.fill(1, 0, nx);
  if (kind === 'stripline') fixed.fill(1, (ny - 1) * nx, ny * nx);
  // Trace at 1 V.
  const iTrace0 = nside;
  const iTrace1 = nside + nw;
  const jTrace0 = nh;
  const jTrace1 = nh + nt;
  for (let j = jTrace0; j <= jTrace1; j++) {
    for (let i = iTrace0; i <= iTrace1; i++) {
      fixed[j * nx + i] = 1;
      fixedValue[j * nx + i] = 1;
    }
  }

  return {
    problem: { grid: { nx, ny, dx, dy }, epsR: eps, fixed, fixedValue },
    meta: { iTrace0, iTrace1, jTrace0, jTrace1, jDiel: jTrace0, x0: -(w / 2 + nside * dx) },
  };
}

/** The same problem with all εr = 1, for the vacuum solve of the two-solve method. */
export function withVacuumDielectric(p: ElectrostaticProblem): ElectrostaticProblem {
  return { ...p, epsR: new Float64Array(p.epsR.length).fill(1) };
}
