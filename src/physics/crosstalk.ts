/**
 * Crosstalk physics (Module 6): even/odd-mode analysis of a symmetric coupled
 * pair via the electrostatic solver, and the weak-coupling closed-form NEXT /
 * FEXT pulse model for matched terminations.
 *
 * Sources: S. Hall & H. Heck, "Advanced Signal Integrity for High-Speed
 * Digital Design," Wiley 2009, ch. 4 (coupled lines, NEXT/FEXT coefficients);
 * E. Bogatin, "Signal and Power Integrity — Simplified," 3rd ed. 2018, ch. 10;
 * C. R. Paul, "Analysis of Multiconductor Transmission Lines," 2nd ed. 2008
 * (mode decomposition, per-unit-length matrices).
 *
 * SI units throughout: m, s, F/m, H/m, Ω. Crosstalk voltages are expressed
 * per unit aggressor swing (dimensionless coefficients).
 */
import { C_LIGHT } from './constants';
import {
  conductorCharge,
  rectNodeMask,
  solveLaplace,
  type ElectrostaticProblem,
  type SolveOptions,
} from './electrostatic';
import {
  buildCoupledPairProblem,
  withVacuumDielectric,
  type CoupledPairGeometry,
  type PairProblemMeta,
} from './traceGeometry';

/** Per-line even/odd capacitances, real dielectric and vacuum [F/m]. */
export interface EvenOddCaps {
  Ce: number;
  Ce0: number;
  Co: number;
  Co0: number;
}

export interface CoupledPairParams extends EvenOddCaps {
  /** Per-line modal inductances L_e = 1/(c²·C_e0), L_o = 1/(c²·C_o0) [H/m]. */
  Le: number;
  Lo: number;
  /** Modal impedances Z_even = 1/(c√(C_e·C_e0)), Z_odd = 1/(c√(C_o·C_o0)) [Ω]. */
  zEven: number;
  zOdd: number;
  /** Z_diff = 2·Z_odd, Z_comm = Z_even/2 [Ω]. */
  zDiff: number;
  zComm: number;
  /** Per-mode effective permittivities C/C0. */
  epsEffEven: number;
  epsEffOdd: number;
  /** Capacitive coupling ratio Cm/Cs = (C_o − C_e)/(C_o + C_e). */
  cmCs: number;
  /** Inductive coupling ratio Lm/Ls = (L_e − L_o)/(L_e + L_o). */
  lmLs: number;
}

/**
 * All coupled-pair parameters from the four even/odd capacitances.
 *
 * With the symmetric capacitance matrix [[Cs+Cm′...]] expressed per line:
 * even (1,1) charge/V gives C_e = C11 + C12, odd (1,−1) gives C_o = C11 − C12,
 * so the mutual/self ratios follow as Cm/Cs = (C_o − C_e)/(C_o + C_e) and,
 * from the vacuum solves (dielectrics don't touch L), L_e = 1/(c²C_e0),
 * L_o = 1/(c²C_o0), Lm/Ls = (L_e − L_o)/(L_e + L_o).
 * Modal impedances: Z_mode = 1/(c√(C·C0)) per line (two-solve method, as in
 * transmissionLine.ts); Z_diff = 2·Z_odd, Z_comm = Z_even/2.
 * Source: Paul 2008 §7 (mode decomposition); Hall & Heck 2009 ch. 4.
 */
export function coupledParamsFromEvenOdd(c: EvenOddCaps): CoupledPairParams {
  const { Ce, Ce0, Co, Co0 } = c;
  const Le = 1 / (C_LIGHT * C_LIGHT * Ce0);
  const Lo = 1 / (C_LIGHT * C_LIGHT * Co0);
  const zEven = 1 / (C_LIGHT * Math.sqrt(Ce * Ce0));
  const zOdd = 1 / (C_LIGHT * Math.sqrt(Co * Co0));
  return {
    ...c,
    Le,
    Lo,
    zEven,
    zOdd,
    zDiff: 2 * zOdd,
    zComm: zEven / 2,
    epsEffEven: Ce / Ce0,
    epsEffOdd: Co / Co0,
    cmCs: (Co - Ce) / (Co + Ce),
    lmLs: (Le - Lo) / (Le + Lo),
  };
}

/** Warm-start fields for solveCoupledPair (same grid signature only). */
export interface PairWarmStart {
  even?: Float64Array;
  evenVac?: Float64Array;
  odd?: Float64Array;
  oddVac?: Float64Array;
}

export interface PairSolveResult {
  caps: EvenOddCaps;
  params: CoupledPairParams;
  /** Real-dielectric mode fields, for rendering. */
  phiEven: Float64Array;
  phiOdd: Float64Array;
  phiEvenVac: Float64Array;
  phiOddVac: Float64Array;
  problem: ElectrostaticProblem;
  meta: PairProblemMeta;
  iterations: number;
}

/**
 * Even/odd analysis of the symmetric pair: solve the cross-section with
 * excitations (1, 1) and (1, −1), each with the real dielectric and with all
 * εr = 1, and read the per-line charge off one trace (discrete Gauss law,
 * conductorCharge) → C_e, C_e0, C_o, C_o0 → coupledParamsFromEvenOdd.
 */
export function solveCoupledPair(
  g: CoupledPairGeometry,
  nxTarget = 257,
  nyTarget = 129,
  warm: PairWarmStart = {},
  opts: SolveOptions = {},
): PairSolveResult {
  const { problem, meta } = buildCoupledPairProblem(g, 1, 1, nxTarget, nyTarget);
  const mask = rectNodeMask(problem.grid, meta.iLeft0, meta.iLeft1, meta.jTrace0, meta.jTrace1);

  const oddProblem = buildCoupledPairProblem(g, 1, -1, nxTarget, nyTarget).problem;
  const vacEven = withVacuumDielectric(problem);
  const vacOdd = withVacuumDielectric(oddProblem);

  const even = solveLaplace(problem, { ...opts, phiInit: warm.even });
  const evenVac = solveLaplace(vacEven, { ...opts, phiInit: warm.evenVac });
  const odd = solveLaplace(oddProblem, { ...opts, phiInit: warm.odd });
  const oddVac = solveLaplace(vacOdd, { ...opts, phiInit: warm.oddVac });

  const caps: EvenOddCaps = {
    Ce: conductorCharge(problem, even.phi, mask),
    Ce0: conductorCharge(vacEven, evenVac.phi, mask),
    Co: conductorCharge(oddProblem, odd.phi, mask),
    Co0: conductorCharge(vacOdd, oddVac.phi, mask),
  };
  return {
    caps,
    params: coupledParamsFromEvenOdd(caps),
    phiEven: even.phi,
    phiOdd: odd.phi,
    phiEvenVac: evenVac.phi,
    phiOddVac: oddVac.phi,
    problem,
    meta,
    iterations: even.iterations + evenVac.iterations + odd.iterations + oddVac.iterations,
  };
}

/**
 * Propagation delay TD = ℓ·√ε_eff/c of the coupled section, from the
 * ISOLATED line's ε_eff (weak-coupling model: both modes assumed to travel
 * at the isolated-line speed).
 *
 * @param length coupled length ℓ [m]
 * @param epsEff isolated-line effective permittivity
 * @returns delay [s]
 */
export function propagationDelay(length: number, epsEff: number): number {
  return (length * Math.sqrt(epsEff)) / C_LIGHT;
}

/**
 * Saturated near-end (backward) crosstalk coefficient
 * Kb = ¼·(Cm/Cs + Lm/Ls). Source: Hall & Heck 2009, ch. 4 (backward
 * crosstalk coefficient); Bogatin 2018 ch. 10.
 * Assumptions: weak coupling (Kb ≪ 1, victim does not load the aggressor),
 * both lines matched at both ends, lossless, quasi-TEM, identical traces.
 */
export function nextCoefficient(cmCs: number, lmLs: number): number {
  return 0.25 * (cmCs + lmLs);
}

/**
 * Far-end (forward) crosstalk coefficient per unit TD/t_r:
 * Kf = ½·(Cm/Cs − Lm/Ls). Sign convention: crosstalk voltages are per unit
 * aggressor swing for a RISING edge launched at the near end; the FEXT pulse
 * amplitude is Kf·TD/t_r, so where inductive coupling wins (microstrip:
 * Lm/Ls > Cm/Cs) Kf < 0 and the far-end pulse is NEGATIVE — opposite
 * polarity to the aggressor edge. In a homogeneous dielectric (stripline)
 * Lm/Ls = Cm/Cs exactly, so Kf = 0: forward capacitive and inductive
 * coupling cancel. Source: Hall & Heck 2009, ch. 4.
 */
export function fextCoefficient(cmCs: number, lmLs: number): number {
  return 0.5 * (cmCs - lmLs);
}

/**
 * NEXT amplitude for a ramp edge: the backward wave sums over 2·TD of
 * round-trip coupling, so it saturates at Kb once 2·TD ≥ t_r and is scaled
 * by 2·TD/t_r for electrically short sections. Length-independent once
 * saturated. Per unit aggressor swing.
 */
export function nextAmplitude(cmCs: number, lmLs: number, td: number, tr: number): number {
  return nextCoefficient(cmCs, lmLs) * Math.min(1, (2 * td) / tr);
}

/**
 * FEXT amplitude for a ramp edge: Kf·TD/t_r (signed, see fextCoefficient) —
 * the forward pulse rides along with the aggressor edge and accumulates over
 * the whole coupled length, so it grows linearly with length (exact in this
 * model; real lines saturate when the pulse becomes comparable to the edge).
 * Pulse width ≈ t_r. Per unit aggressor swing.
 */
export function fextAmplitude(cmCs: number, lmLs: number, td: number, tr: number): number {
  return (fextCoefficient(cmCs, lmLs) * td) / tr;
}

/** Unit ramp: 0 before t = 0, t/tr on [0, tr], 1 after. */
const ramp = (t: number, tr: number) => (t <= 0 ? 0 : t >= tr ? 1 : t / tr);

/**
 * Near-end victim waveform per unit aggressor swing (rising ramp launched at
 * t = 0 next to the observation point): V_NE(t) = Kb·[r(t) − r(t − 2TD)] —
 * a pulse of duration 2·TD (+ edges), amplitude nextAmplitude.
 * Closed-form weak-coupling shape only — no FDTD.
 */
export function nextWaveform(
  t: number,
  cmCs: number,
  lmLs: number,
  td: number,
  tr: number,
): number {
  return nextCoefficient(cmCs, lmLs) * (ramp(t, tr) - ramp(t - 2 * td, tr));
}

/**
 * Far-end victim waveform per unit aggressor swing: the derivative-shaped
 * pulse Kf·TD·(d/dt)r(t − TD) — a rectangle of width t_r starting when the
 * aggressor edge arrives at the far end (t = TD), amplitude fextAmplitude
 * (negative for microstrip — see fextCoefficient's sign convention).
 */
export function fextWaveform(
  t: number,
  cmCs: number,
  lmLs: number,
  td: number,
  tr: number,
): number {
  return t > td && t < td + tr ? fextAmplitude(cmCs, lmLs, td, tr) : 0;
}
