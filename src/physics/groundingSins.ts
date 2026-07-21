/**
 * Grounding-sins physics (Module 8): detour inductance when a slot or moat
 * interrupts the HF return corridor, via partial inductance (Johnson &
 * Graham), layer-hop return impedance between two reference planes, and a
 * DC plane-current solve reusing the SOR Laplace solver in its steady-
 * conduction analog. Closed forms plus that one solver reuse — no new
 * numerics.
 *
 * SI units throughout: m, s, Hz, A, Ω, H, F, V.
 */
import { EPS_0 } from './constants';
import {
  cellField,
  conductorCharge,
  solveLaplace,
  type ElectrostaticProblem,
  type Grid,
} from './electrostatic';
import { effectiveStripRadius, groundBounce, rectLoopInductance } from './loopInductance';
import { capImpedance, type CapSpec, type Complex } from './pdn';
import { interplaneCapacitancePerArea } from './planePair';

/**
 * Module 5's ground-bounce V = L·ΔI/Δt, re-exported unchanged (same
 * reference) — see CLAUDE.md rule against reimplementing physics.
 */
export { groundBounce };

/**
 * Added loop inductance when the HF return corridor is interrupted and the
 * return current must detour around the end of a slot/moat (or to a bridge).
 *
 * ORDER-OF-MAGNITUDE ENGINEERING ESTIMATE, flagged as such in the UI. Model:
 * the return current that would have flowed under the trace (Module 1: at HF
 * the return bundles within ±3h of the trace, J ∝ 1/(1+(x/h)²)) instead runs
 * along the near slot edge to the obstacle end, around it, and back — an
 * extra rectangular loop of sides a (detour distance, crossing point to the
 * obstacle end) × b (slot/moat width). Its inductance is the Rosa/Grover
 * rectangle (Module 5's rectLoopInductance; Grover 1946, ch. 8), with the
 * equivalent conductor radius
 *
 *   r_eff = max( w_trace/2, min(3h, b/4, a/4) )
 *
 * — the current sheet is about as wide as the ±3h corridor, capped at a
 * quarter of either rectangle side so the thin-wire formula stays inside its
 * validity range, and floored at the trace half-width so r_eff never
 * collapses below the physical conductor. The result is clamped at ≥ 0 (the
 * raw formula can go slightly negative when a ≲ 4·r_eff, i.e. when there is
 * essentially no detour). Not modeled: current spreading beyond the
 * corridor, mutual coupling to the signal trace, the slot's own excitation
 * as a slot antenna.
 *
 * @param a      detour distance: crossing point to the nearest obstacle end
 *               (or to the bridge/stitch that closes the path) [m]
 * @param b      slot/moat width [m]
 * @param h      trace height above the plane [m] (sets the ±3h corridor)
 * @param traceW trace width [m] (floor for r_eff)
 * @returns added inductance ΔL [H]
 */
export function detourInductance(a: number, b: number, h: number, traceW: number): number {
  if (a <= 0 || b <= 0) return 0;
  const rEff = Math.max(traceW / 2, Math.min(3 * h, b / 4, a / 4));
  return Math.max(0, rectLoopInductance(a, b, rEff));
}

/**
 * Detour inductance of a trace crossing a slot of length `slotLen`, width
 * `slotW`, at signed offset `crossOffset` from the slot's center (along its
 * length). The return detours around the NEARER end, so the detour distance
 * is a = slotLen/2 − |crossOffset|; if the crossing is outside the slot
 * (|offset| ≥ slotLen/2) the corridor is not interrupted and ΔL = 0.
 * See detourInductance for the model and its caveats.
 *
 * @param slotLen     slot length [m]
 * @param slotW       slot width [m]
 * @param crossOffset crossing position along the slot, 0 = center [m]
 * @param h           trace height above the plane [m]
 * @param traceW      trace width [m]
 * @returns added inductance ΔL [H]
 */
export function slotDetourInductance(
  slotLen: number,
  slotW: number,
  crossOffset: number,
  h: number,
  traceW: number,
): number {
  const a = slotLen / 2 - Math.abs(crossOffset);
  return detourInductance(a, slotW, h, traceW);
}

const METERS_PER_INCH = 0.0254;

/**
 * Partial self-inductance of a via barrel:
 *
 *   L = 5.08·h·[ln(4h/d) + 1]   nH, with h and d in inches
 *
 * Source: H. Johnson & M. Graham, "High-Speed Digital Design: A Handbook of
 * Black Magic," Prentice Hall, 1993, ch. 7 (Vias), section "Inductance of a
 * Via". SI in/out; the inch conversion is internal (4h/d is unit-free, only
 * the prefactor carries units). A PARTIAL inductance (Module 5): it predicts
 * a loop's behavior only once the whole return path is accounted for.
 *
 * @param h via length [m]
 * @param d via (barrel) diameter [m]
 * @returns partial inductance [H]
 */
export function viaInductance(h: number, d: number): number {
  const hIn = h / METERS_PER_INCH;
  return 5.08 * hIn * (Math.log((4 * h) / d) + 1) * 1e-9;
}

/**
 * Interplane capacitance available to a layer-hopping signal's return
 * current within a local square patch of side `patchSide` around the hop:
 * C = C″(εr, d)·patchSide², reusing Module 3's interplaneCapacitancePerArea.
 * The "local reach" patch is a pedagogical stand-in for how much plane the
 * displacement current actually uses near the via — the real extent is
 * frequency-dependent (radial spreading), which this model ignores.
 *
 * @param epsR      dielectric relative permittivity between the planes
 * @param d         plane-to-plane spacing [m]
 * @param patchSide side of the local square patch [m]
 * @returns capacitance [F]
 */
export function localPatchCapacitance(epsR: number, d: number, patchSide: number): number {
  return interplaneCapacitancePerArea(epsR, d) * patchSide * patchSide;
}

/**
 * How the return current gets from reference plane P1 to reference plane P2
 * at a layer hop:
 *  - 'planes': nothing added — displacement current through the local
 *    interplane capacitance C only (localPatchCapacitance).
 *  - 'via': a stitching via (same-net planes), modeled as its partial
 *    inductance L alone (viaInductance). SIMPLIFICATION: plane spreading
 *    inductance to/from the via is ignored.
 *  - 'cap': a stitching capacitor (different-net planes), Module 4's series
 *    RLC — C, ESR, ESL — with Module 5's mounting-loop inductance folded
 *    into spec.lMount.
 */
export type LayerHopConfig =
  | { kind: 'planes'; C: number }
  | { kind: 'via'; L: number }
  | { kind: 'cap'; spec: CapSpec };

/**
 * Return-path impedance between the two reference planes of a layer hop:
 *
 *   planes: Z = 1/(jωC)      via: Z = jωL      cap: Z = ESR + j(ωL − 1/ωC)
 *
 * The cap branch reuses Module 4's capImpedance (Bogatin 2018, ch. 13).
 *
 * @param f frequency [Hz]
 * @returns complex impedance [Ω]
 */
export function zReturn(f: number, cfg: LayerHopConfig): Complex {
  const omega = 2 * Math.PI * f;
  switch (cfg.kind) {
    case 'planes':
      return { re: 0, im: -1 / (omega * cfg.C) };
    case 'via':
      return { re: 0, im: omega * cfg.L };
    case 'cap':
      return capImpedance(cfg.spec, omega);
  }
}

/**
 * Series-resonance / crossover frequency f = 1/(2π√(LC)) — where |ωL| =
 * |1/ωC|: the frequency above which the interplane capacitance beats a
 * stitching via, or at which a stitch capacitor's |Z| dips to its ESR.
 *
 * @param L inductance [H]
 * @param C capacitance [F]
 * @returns frequency [Hz]
 */
export function seriesCrossoverFrequency(L: number, C: number): number {
  return 1 / (2 * Math.PI * Math.sqrt(L * C));
}

/** Re-exported so the UI computes r_eff consistently with Module 5. */
export { effectiveStripRadius };

/**
 * Relative conductivity assigned to slot/moat cells: small but non-zero so
 * interior slot nodes keep a non-singular stencil. Leakage across a slot
 * scales with this value — negligible against the 1% current-conservation
 * budget of the tests.
 */
const SLOT_SIGMA = 1e-6;

export interface DcPlaneParams {
  /** Board size [m]. */
  W: number;
  H: number;
  /** Node counts (plan-view grid). */
  nx: number;
  ny: number;
  /** Insulating rectangles (slots/moats), corner coordinates [m]. */
  slots: { x0: number; y0: number; x1: number; y1: number }[];
  /** Current injection / extraction disc centers (trace endpoint vias) [m]. */
  source: { x: number; y: number };
  sink: { x: number; y: number };
  /** Contact disc radius [m]. */
  contactR: number;
}

export interface DcPlaneResult {
  grid: Grid;
  /** Node potentials, source disc at +1, sink at −1 [V]. */
  phi: Float64Array;
  /** Cell-centered relative conductivity (1 = copper, SLOT_SIGMA = slot). */
  sigma: Float64Array;
  /**
   * Cell-centered current density J = σ_rel·E in units of σ_s·V/m (σ_s the
   * sheet conductance): direction and relative magnitude are physical, the
   * absolute scale is arbitrary — exactly what the visualization needs.
   */
  jx: Float64Array;
  jy: Float64Array;
  /** Net current out of the source / into the sink discs, units σ_s·V. */
  iSource: number;
  iSink: number;
  sourceMask: Uint8Array;
  sinkMask: Uint8Array;
  iterations: number;
  residual: number;
}

/**
 * DC current distribution in a reference plane with slots, in plan view.
 * Steady conduction: ∇·J = 0 with J = σE = −σ∇φ gives ∇·(σ∇φ) = 0 — the
 * same elliptic operator as electrostatics' ∇·(ε∇φ) = 0 (e.g. Haus &
 * Melcher, "Electromagnetic Fields and Energy," 1989, ch. 7), so the SOR
 * solver is reused verbatim with the εr map read as a relative-conductivity
 * map: 1 in copper, ~0 in slots (zero-flux Neumann at slot edges emerges
 * naturally), and the un-fixed board edge is already Neumann. Source and
 * sink are Dirichlet discs at ±1 V at the trace's endpoint vias.
 *
 * The plane is treated as a uniform 2D sheet (thickness ≪ lateral scale);
 * currents are per-unit-sheet-conductance, see DcPlaneResult.
 *
 * @param phiInit optional warm start (previous solution on the same grid)
 */
export function solveDcPlane(p: DcPlaneParams, phiInit?: Float64Array): DcPlaneResult {
  const { nx, ny } = p;
  const dx = p.W / (nx - 1);
  const dy = p.H / (ny - 1);
  const grid: Grid = { nx, ny, dx, dy };
  const ncx = nx - 1;
  const ncy = ny - 1;

  const sigma = new Float64Array(ncx * ncy).fill(1);
  for (const s of p.slots) {
    for (let j = 0; j < ncy; j++) {
      const yc = (j + 0.5) * dy;
      if (yc < s.y0 || yc > s.y1) continue;
      for (let i = 0; i < ncx; i++) {
        const xc = (i + 0.5) * dx;
        if (xc >= s.x0 && xc <= s.x1) sigma[j * ncx + i] = SLOT_SIGMA;
      }
    }
  }

  const fixed = new Uint8Array(nx * ny);
  const fixedValue = new Float64Array(nx * ny);
  const discMask = (c: { x: number; y: number }): Uint8Array => {
    const mask = new Uint8Array(nx * ny);
    const r = Math.max(p.contactR, Math.hypot(dx, dy)); // ≥ 1 node guaranteed
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (Math.hypot(i * dx - c.x, j * dy - c.y) <= r) mask[j * nx + i] = 1;
      }
    }
    return mask;
  };
  const sourceMask = discMask(p.source);
  const sinkMask = discMask(p.sink);
  for (let k = 0; k < nx * ny; k++) {
    if (sourceMask[k]) {
      fixed[k] = 1;
      fixedValue[k] = 1;
    } else if (sinkMask[k]) {
      fixed[k] = 1;
      fixedValue[k] = -1;
    }
  }

  const problem: ElectrostaticProblem = { grid, epsR: sigma, fixed, fixedValue };
  const { phi, iterations, residual } = solveLaplace(problem, { phiInit });

  const { ex, ey } = cellField(grid, phi);
  const jx = new Float64Array(ncx * ncy);
  const jy = new Float64Array(ncx * ncy);
  for (let k = 0; k < ncx * ncy; k++) {
    jx[k] = sigma[k]! * ex[k]!;
    jy[k] = sigma[k]! * ey[k]!;
  }

  // Net current through a disc boundary by the discrete "Gauss law" on the
  // solver's own link coefficients (conductorCharge), reinterpreted for
  // conduction: I = Σ a_link·(φ_in − φ_out) — drop conductorCharge's ε0.
  const iSource = conductionCurrent(problem, phi, sourceMask);
  const iSink = conductionCurrent(problem, phi, sinkMask);

  return { grid, phi, sigma, jx, jy, iSource, iSink, sourceMask, sinkMask, iterations, residual };
}

/** conductorCharge with the ε0 factor removed: current in units of σ_s·V. */
function conductionCurrent(
  p: ElectrostaticProblem,
  phi: Float64Array,
  mask: Uint8Array,
): number {
  return conductorCharge(p, phi, mask) / EPS_0;
}
