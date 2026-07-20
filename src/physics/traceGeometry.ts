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
 * Offset stripline: like stripline but with unequal clearances h (below) and
 * hAbove; with hAbove = h it produces the identical symmetric-stripline grid.
 */
import type { ElectrostaticProblem } from './electrostatic';

export type TraceKind = 'microstrip' | 'stripline' | 'offset-stripline';

export interface TraceGeometry {
  kind: TraceKind;
  /** Trace width [m]. */
  w: number;
  /** Trace thickness [m]; 0 → single node row. */
  t: number;
  /**
   * Microstrip: dielectric height under the trace. Stripline: trace-to-plane
   * clearance (both sides). Offset stripline: clearance to the LOWER plane. [m]
   */
  h: number;
  /**
   * Offset stripline only: clearance to the upper plane [m]. Defaults to h,
   * in which case the geometry is identical to the symmetric stripline.
   */
  hAbove?: number;
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
 * Shared dy refinement: cell count across the reference clearance hRef.
 * Starts from the target dy, caps cell anisotropy (dx/dy) at 2.5 where the
 * minimum resolution allows, and — because a finite trace thickness must be
 * resolvable (dy ≤ ~t) or the modeled thickness nt·dy quantizes far from t
 * and Z0 jumps between grid densities — refines for t.
 */
function refineNRef(hRef: number, dyT: number, dx: number, t: number): number {
  let nRef = clamp(Math.round(hRef / dyT), 4, MAX_TRACE_CELLS);
  nRef = Math.max(4, Math.min(nRef, Math.ceil(hRef / (dx / 2.5))));
  if (t > 0) nRef = Math.min(Math.max(nRef, Math.ceil(hRef / t)), MAX_TRACE_CELLS);
  return nRef;
}

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
  /** Upper-plane clearance for stripline variants; null for microstrip. */
  const hAbove = kind === 'microstrip' ? null : kind === 'stripline' ? h : g.hAbove ?? h;
  const b = hAbove !== null ? h + t + hAbove : 0;
  const margin = kind === 'microstrip' ? 8 * Math.max(w, h) : Math.max(3 * b, w);
  const boxW = w + 2 * margin;
  const boxH = kind === 'microstrip' ? h + t + 8 * Math.max(w, h) : b;

  const dxT = boxW / (nxTarget - 1);
  const nw = clamp(Math.round(w / dxT), 6, MAX_TRACE_CELLS);
  const dx = w / nw;
  const nside = Math.min(Math.ceil(margin / dx), MAX_MARGIN_CELLS);
  const nx = nw + 2 * nside + 1;

  const dyT = boxH / (nyTarget - 1);
  // dy is set by the smaller plane clearance so both gaps stay resolved.
  const hRef = hAbove !== null ? Math.min(h, hAbove) : h;
  const nRef = refineNRef(hRef, dyT, dx, t);
  const dy = hRef / nRef;
  const nh = hRef === h ? nRef : Math.max(4, Math.round(h / dy));
  const nt = t > 0 ? Math.max(1, Math.round(t / dy)) : 0;
  const ntop =
    kind === 'microstrip'
      ? Math.min(Math.ceil((8 * Math.max(w, h)) / dy), MAX_MARGIN_CELLS)
      : hAbove === hRef
        ? nRef
        : Math.max(4, Math.round(hAbove! / dy));
  const ny = nh + nt + ntop + 1;

  const ncx = nx - 1;
  const ncy = ny - 1;
  const eps = new Float64Array(ncx * ncy);
  for (let j = 0; j < ncy; j++) {
    const e = kind !== 'microstrip' || j < nh ? epsR : 1;
    eps.fill(e, j * ncx, (j + 1) * ncx);
  }

  const fixed = new Uint8Array(nx * ny);
  const fixedValue = new Float64Array(nx * ny);
  // Bottom plane at 0 V; stripline also has a top plane at 0 V.
  fixed.fill(1, 0, nx);
  if (kind !== 'microstrip') fixed.fill(1, (ny - 1) * nx, ny * nx);
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

export interface CoupledPairGeometry {
  kind: 'microstrip' | 'stripline';
  /** Trace width (each trace) [m]. */
  w: number;
  /** Trace thickness [m]; 0 → single node row. */
  t: number;
  /**
   * Microstrip: dielectric height under the traces. Stripline: trace-to-plane
   * clearance (both sides, symmetric). [m]
   */
  h: number;
  /** Edge-to-edge spacing between the traces [m]. */
  s: number;
  /** Dielectric relative permittivity. */
  epsR: number;
}

export interface PairProblemMeta {
  /** Node ranges of the two traces, inclusive. */
  iLeft0: number;
  iLeft1: number;
  iRight0: number;
  iRight1: number;
  jTrace0: number;
  jTrace1: number;
  /** Node row of the (microstrip) dielectric top surface = jTrace0. */
  jDiel: number;
  /** x of node i = 0 [m]; the symmetry plane between the traces is x = 0. */
  x0: number;
  /** Edge-to-edge spacing actually meshed (s snapped to the grid) [m]. */
  sActual: number;
}

/**
 * Grid builder for a symmetric coupled pair: two identical traces, width w,
 * edge-to-edge spacing s, mirrored about x = 0, at potentials vLeft / vRight
 * (e.g. (1, 1) even, (1, −1) odd, (1, 0) aggressor-only). Same margin and
 * dy-refinement rules as buildTraceProblem; the gap is snapped to a whole
 * number of cells per half so the symmetry plane lands on a node column
 * (meta.sActual reports the meshed spacing).
 */
export function buildCoupledPairProblem(
  g: CoupledPairGeometry,
  vLeft: number,
  vRight: number,
  nxTarget = 257,
  nyTarget = 129,
): { problem: ElectrostaticProblem; meta: PairProblemMeta } {
  const { kind, w, t, h, s, epsR } = g;
  const b = h + t + h; // stripline plane-to-plane spacing
  const margin = kind === 'microstrip' ? 8 * Math.max(w, h) : Math.max(3 * b, w);
  const boxW = 2 * w + s + 2 * margin;
  const boxH = kind === 'microstrip' ? h + t + 8 * Math.max(w, h) : b;

  const dxT = boxW / (nxTarget - 1);
  // Min 8 cells across each trace (vs. 6 single-trace) so the gap, which is
  // meshed with the same dx, snaps to s with acceptable error.
  const nw = clamp(Math.round(w / dxT), 8, MAX_TRACE_CELLS);
  const dx = w / nw;
  const ns2 = clamp(Math.round(s / (2 * dx)), 1, MAX_MARGIN_CELLS);
  const nside = Math.min(Math.ceil(margin / dx), MAX_MARGIN_CELLS);
  const nx = 2 * (nside + nw + ns2) + 1;

  const dyT = boxH / (nyTarget - 1);
  const nRef = refineNRef(h, dyT, dx, t);
  const dy = h / nRef;
  const nh = nRef;
  const nt = t > 0 ? Math.max(1, Math.round(t / dy)) : 0;
  const ntop =
    kind === 'microstrip'
      ? Math.min(Math.ceil((8 * Math.max(w, h)) / dy), MAX_MARGIN_CELLS)
      : nRef;
  const ny = nh + nt + ntop + 1;

  const ncx = nx - 1;
  const ncy = ny - 1;
  const eps = new Float64Array(ncx * ncy);
  for (let j = 0; j < ncy; j++) {
    const e = kind !== 'microstrip' || j < nh ? epsR : 1;
    eps.fill(e, j * ncx, (j + 1) * ncx);
  }

  const fixed = new Uint8Array(nx * ny);
  const fixedValue = new Float64Array(nx * ny);
  fixed.fill(1, 0, nx);
  if (kind !== 'microstrip') fixed.fill(1, (ny - 1) * nx, ny * nx);

  const iLeft0 = nside;
  const iLeft1 = nside + nw;
  const iRight0 = nside + nw + 2 * ns2;
  const iRight1 = iRight0 + nw;
  const jTrace0 = nh;
  const jTrace1 = nh + nt;
  for (let j = jTrace0; j <= jTrace1; j++) {
    for (let i = iLeft0; i <= iLeft1; i++) {
      fixed[j * nx + i] = 1;
      fixedValue[j * nx + i] = vLeft;
    }
    for (let i = iRight0; i <= iRight1; i++) {
      fixed[j * nx + i] = 1;
      fixedValue[j * nx + i] = vRight;
    }
  }

  return {
    problem: { grid: { nx, ny, dx, dy }, epsR: eps, fixed, fixedValue },
    meta: {
      iLeft0,
      iLeft1,
      iRight0,
      iRight1,
      jTrace0,
      jTrace1,
      jDiel: jTrace0,
      x0: -(nside + nw + ns2) * dx,
      sActual: 2 * ns2 * dx,
    },
  };
}
