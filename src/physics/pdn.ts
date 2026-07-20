/**
 * Lumped power-distribution-network (PDN) impedance models: real capacitors
 * as series RLC branches, parallel combination, plane-pair branch, target
 * impedance. Closed forms only — no field solving.
 *
 * Sources: E. Bogatin, "Signal and Power Integrity — Simplified," 3rd ed.
 * (2018), ch. 13 (PDN); L. D. Smith, R. E. Anderson, D. W. Forehand,
 * T. J. Pelc, T. Roy, "Power Distribution System Design Methodology and
 * Capacitor Selection for Modern CMOS Technology," IEEE Trans. Advanced
 * Packaging, vol. 22, no. 3, pp. 284–291, 1999.
 *
 * SI units throughout: F, Ω, H, Hz, rad/s.
 */
import { interplaneCapacitancePerArea } from './planePair';

export interface Complex {
  re: number;
  im: number;
}

export const zMag = (z: Complex): number => Math.hypot(z.re, z.im);

export interface CapSpec {
  /** Capacitance [F]. */
  C: number;
  /** Equivalent series resistance [Ω]. */
  esr: number;
  /** Equivalent series (package) inductance [H]. */
  esl: number;
  /** Mounting inductance [H] — vias + traces to the planes (loop area, Module 1). */
  lMount: number;
  /** Number of identical parts in parallel. */
  n: number;
}

/** Total series inductance L_total = ESL + L_mount [H]. */
export function totalInductance(spec: CapSpec): number {
  return spec.esl + spec.lMount;
}

/**
 * Series-RLC impedance of ONE capacitor:
 *
 *   Z(ω) = ESR + j(ω·L_total − 1/(ω·C))
 *
 * Below the self-resonant frequency the 1/(ωC) term dominates (capacitive);
 * above it the ωL term dominates (inductive); at SRF, |Z| = ESR.
 * Source: Bogatin 2018, ch. 13.
 */
export function capImpedance(spec: CapSpec, omega: number): Complex {
  return { re: spec.esr, im: omega * totalInductance(spec) - 1 / (omega * spec.C) };
}

/** Self-resonant frequency SRF = 1/(2π·√(L_total·C)) [Hz]. */
export function selfResonantFrequency(spec: CapSpec): number {
  return 1 / (2 * Math.PI * Math.sqrt(totalInductance(spec) * spec.C));
}

/**
 * Parallel PDN impedance: Z = 1/Σᵢ(nᵢ/Zᵢ) over all branches with nᵢ > 0
 * identical parts each. Returns |Z| = ∞ when no branch is populated.
 */
export function pdnImpedance(specs: CapSpec[], omega: number): Complex {
  let yr = 0;
  let yi = 0;
  for (const s of specs) {
    if (s.n <= 0) continue;
    const z = capImpedance(s, omega);
    const m2 = z.re * z.re + z.im * z.im;
    yr += (s.n * z.re) / m2;
    yi -= (s.n * z.im) / m2;
  }
  const ym2 = yr * yr + yi * yi;
  if (ym2 === 0) return { re: Infinity, im: 0 };
  return { re: yr / ym2, im: -yi / ym2 };
}

/**
 * Plane pair as a lumped PDN branch: C = C″(εr, d)·area (Module 3's
 * interplane capacitance) in series with a small connection inductance.
 * NOT modeled: spreading inductance and plane cavity (modal) resonances —
 * both matter above a few hundred MHz on real boards.
 *
 * @param epsR   dielectric relative permittivity
 * @param d      plane-to-plane spacing [m]
 * @param area   plane overlap area [m²]
 * @param lPlane series connection inductance [H] (default-ish ~10 pH)
 */
export function planeBranch(epsR: number, d: number, area: number, lPlane: number): CapSpec {
  return { C: interplaneCapacitancePerArea(epsR, d) * area, esr: 0, esl: lPlane, lMount: 0, n: 1 };
}

/**
 * Target impedance Z_t = (V_rail·ripple_fraction)/ΔI: keeping |Z_pdn| below
 * Z_t bounds the supply ripple to the allowance for the worst-case transient
 * current step. Source: Smith et al. 1999, eq. (1).
 */
export function targetImpedance(vRail: number, rippleFraction: number, dI: number): number {
  return (vRail * rippleFraction) / dI;
}

/** n log-spaced frequencies from f0 to f1 inclusive [Hz]. */
export function logspace(f0: number, f1: number, n: number): Float64Array {
  const out = new Float64Array(n);
  const l0 = Math.log10(f0);
  const step = (Math.log10(f1) - l0) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = 10 ** (l0 + i * step);
  return out;
}

/** Indices of strict local maxima of a sampled curve (interior points only). */
export function localMaxima(z: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < z.length - 1; i++) {
    if ((z[i] as number) > (z[i - 1] as number) && (z[i] as number) >= (z[i + 1] as number)) {
      out.push(i);
    }
  }
  return out;
}
