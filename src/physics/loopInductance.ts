/**
 * Loop inductance closed forms (Module 5): rectangular wire loop, parallel
 * wire pair, trace over a plane, and the capacitor mounting loop. Plus the
 * frequency-dependent resistance/impedance of a wire loop and ground bounce.
 * Closed forms only — no field solving.
 *
 * Sources: E. B. Rosa, "The Self and Mutual Inductances of Linear
 * Conductors," Bulletin of the Bureau of Standards, vol. 4, no. 2,
 * pp. 301–344, 1908; F. W. Grover, "Inductance Calculations: Working
 * Formulas and Tables," Van Nostrand, 1946; D. M. Pozar, "Microwave
 * Engineering," 4th ed., 2012, Table 2.1.
 *
 * SI units throughout: m, Hz, Ω, H, A, s, V.
 */
import { C_LIGHT, MU_0, RHO_CU } from './constants';
import { microstripHammerstadJensen } from './hammerstadJensen';
import { skinDepth } from './skinDepth';

/**
 * Module 1's skin-depth function, re-exported unchanged so this module (and
 * its UI) provably uses the very same implementation — see CLAUDE.md rule
 * against reimplementing physics.
 */
export { skinDepth };

/**
 * External (high-frequency) inductance of a rectangular loop of round wire.
 *
 * Sides a × b, wire radius r. Assembled from the partial self- and mutual-
 * inductance formulas of Rosa 1908 (self: (µ0·l/2π)[ln(2l/r) − 1]; mutual of
 * parallel pair at distance d: (µ0·l/2π)[ln((l+√(l²+d²))/d) − √(l²+d²)/l + d/l]),
 * tabulated as the rectangle formula in Grover 1946, ch. 8. With g = √(a²+b²):
 *
 *   L = (µ0/π)·[ a·ln(2a/r) + b·ln(2b/r) − a·ln((a+g)/b) − b·ln((b+g)/a)
 *                + 2g − 2(a+b) ]
 *
 * For a square (a = b = s) this reduces to the classic
 * L = (2µ0·s/π)[ln(s/r) − 0.774].
 *
 * "External" means surface current (GMD of the section = r): the HF value
 * once skin effect has expelled the flux inside the wire. Add
 * internalInductanceLF() for the DC/LF value. Thin-wire formula — accurate
 * for r ≪ a, b; degrades as the wire fills the loop.
 *
 * @param a side length [m]
 * @param b side length [m]
 * @param r wire radius [m]
 * @returns inductance [H]
 */
export function rectLoopInductance(a: number, b: number, r: number): number {
  const g = Math.hypot(a, b);
  return (
    (MU_0 / Math.PI) *
    (a * Math.log((2 * a) / r) +
      b * Math.log((2 * b) / r) -
      a * Math.log((a + g) / b) -
      b * Math.log((b + g) / a) +
      2 * g -
      2 * (a + b))
  );
}

/**
 * Low-frequency internal inductance of round wire: µ0/(8π) ≈ 50 nH per meter
 * of wire, independent of radius (uniform current density; flux inside the
 * conductor). Skin effect expels it at HF — valid only while δ ≳ r.
 * Source: Rosa 1908 (the ln(2l/r) − 3/4 self-inductance vs. − 1 external);
 * Ramo, Whinnery & Van Duzer, "Fields and Waves in Communication
 * Electronics," 3rd ed., 1994, §4.5.
 *
 * @param wireLength total wire length (loop perimeter) [m]
 * @returns internal inductance [H]
 */
export function internalInductanceLF(wireLength: number): number {
  return (MU_0 / (8 * Math.PI)) * wireLength;
}

/**
 * Inductance per unit length of a parallel round-wire pair (go and return),
 * center spacing D, wire radius r:
 *
 *   L′ = (µ0/π)·acosh(D/(2r))
 *
 * Source: Pozar 2012, Table 2.1 (two-wire line). For D/(2r) ≳ 5 this is
 * within ~1 % of the common wide-spacing approximation (µ0/π)·ln(D/r).
 *
 * @param D center-to-center spacing [m]
 * @param r wire radius [m]
 * @returns inductance per length [H/m]
 */
export function wirePairInductancePerMeter(D: number, r: number): number {
  return (MU_0 / Math.PI) * Math.acosh(D / (2 * r));
}

/**
 * Wide-spacing approximation of the wire pair: L′ = (µ0/π)·ln(D/r).
 * Follows from acosh(x) = ln(x + √(x²−1)) ≈ ln(2x) for x ≫ 1.
 * Kept separate so the UI/tests can show how good the folk formula is.
 *
 * @param D center-to-center spacing [m]
 * @param r wire radius [m]
 * @returns inductance per length [H/m]
 */
export function wirePairInductancePerMeterLog(D: number, r: number): number {
  return (MU_0 / Math.PI) * Math.log(D / r);
}

/**
 * Equivalent round-wire radius of a flat rectangular conductor w × t:
 *
 *   r_eff = 0.2235·(w + t)
 *
 * The geometric mean distance of a rectangular section from itself
 * (Rosa 1908; Grover 1946, ch. 3, where the coefficient varies only
 * 0.22313–0.2237 over all aspect ratios). Lets the round-wire loop formulas
 * above be used for PCB traces.
 *
 * @param w conductor width [m]
 * @param t conductor thickness [m]
 * @returns equivalent round-wire radius [m]
 */
export function effectiveStripRadius(w: number, t: number): number {
  return 0.2235 * (w + t);
}

/**
 * Ideal parallel-plate inductance per length of a trace of width w at height
 * h over a plane: L′ = µ0·h/w (all flux confined to the w × h slab under the
 * trace, no fringing). Source: Pozar 2012, Table 2.1 (parallel-plate line).
 * Lower bound in spirit but actually an OVERESTIMATE of the real L′: fringing
 * lets return flux spread, reducing inductance — compare with
 * traceOverPlaneInductancePerMeterHJ.
 *
 * @param h trace height above the plane [m]
 * @param w trace width [m]
 * @returns inductance per length [H/m]
 */
export function traceOverPlaneInductancePerMeterPP(h: number, w: number): number {
  return (MU_0 * h) / w;
}

/**
 * Fringing-aware inductance per length of a trace over a plane, from the
 * Hammerstad–Jensen microstrip Z₀ evaluated in vacuum (εr = 1, see
 * hammerstadJensen.ts for the source and accuracy): for an air line the
 * quasi-TEM relations give L′ = Z₀/c. The gap between this and µ0·h/w IS the
 * fringing field. Closed form only — no field solve.
 *
 * @param h trace height above the plane [m]
 * @param w trace width [m]
 * @returns inductance per length [H/m]
 */
export function traceOverPlaneInductancePerMeterHJ(h: number, w: number): number {
  return microstripHammerstadJensen(w / h, 1).Z0 / C_LIGHT;
}

export interface MountingLoopParams {
  /** Capacitor body span, pad to pad [m]. */
  span: number;
  /** Escape-trace length from each pad to its via [m]. */
  escape: number;
  /** Depth from the mounting surface to the nearest plane [m] — a STACKUP property. */
  depth: number;
  /** Escape trace width [m]. */
  traceW: number;
  /** Copper thickness [m]. */
  traceT: number;
}

/**
 * Capacitor mounting-loop inductance, modeled as a rectangular loop:
 * loop length = span + 2·escape, loop height = depth to the nearest plane,
 * conductor radius = r_eff of the escape trace (via barrels folded into the
 * same r_eff). Uses rectLoopInductance ⇒ same sources.
 *
 * PEDAGOGICAL ESTIMATE (~±30 %): ignores spreading inductance in the plane,
 * proximity effect between trace and plane currents, and treats pads, trace
 * and vias as one uniform round conductor.
 *
 * @returns mounting inductance [H]
 */
export function mountingLoopInductance(p: MountingLoopParams): number {
  const length = p.span + 2 * p.escape;
  return rectLoopInductance(length, p.depth, effectiveStripRadius(p.traceW, p.traceT));
}

/**
 * Ground bounce (simultaneous-switching noise) across an inductance:
 * V = L·ΔI/Δt. Definition of inductance; e.g. Johnson & Graham, "High-Speed
 * Digital Design," 1993, §2.

 * @param L  shared inductance [H]
 * @param dI current step [A]
 * @param dt transition time [s]
 * @returns voltage [V]
 */
export function groundBounce(L: number, dI: number, dt: number): number {
  return (L * dI) / dt;
}

/**
 * Series resistance of a round wire vs. frequency: DC value ρ·l/(π·r²) until
 * the skin depth δ (Module 1's skinDepth) shrinks below r, then the current
 * is confined to a shell of thickness δ:
 *
 *   R(f) = ρ·l / (π·(r² − (r − δ)²))     for δ < r
 *
 * The "conducting shell of thickness δ" is the standard engineering
 * approximation to the exact Bessel-function solution (good to a few % for
 * r/δ ≳ 2; e.g. Johnson & Graham 1993, §2.6). Continuous at δ = r.
 *
 * @param f      frequency [Hz]
 * @param length wire length [m]
 * @param r      wire radius [m]
 * @param rho    resistivity [Ω·m] (default: copper)
 * @returns resistance [Ω]
 */
export function wireResistance(f: number, length: number, r: number, rho: number = RHO_CU): number {
  const delta = skinDepth(f, rho);
  const area = delta >= r ? Math.PI * r * r : Math.PI * (r * r - (r - delta) ** 2);
  return (rho * length) / area;
}

/**
 * Impedance of a wire loop: Z(f) = R(f) + jωL with R(f) = wireResistance and
 * L the (external) loop inductance.
 *
 * @param f      frequency [Hz]
 * @param length loop perimeter [m]
 * @param r      wire radius [m]
 * @param L      loop inductance [H]
 * @returns resistive part R, reactive part X = ωL, and |Z| [Ω]
 */
export function wireLoopImpedance(
  f: number,
  length: number,
  r: number,
  L: number,
  rho: number = RHO_CU,
): { R: number; X: number; mag: number } {
  const R = wireResistance(f, length, r, rho);
  const X = 2 * Math.PI * f * L;
  return { R, X, mag: Math.hypot(R, X) };
}

/**
 * Crossover frequency f_c where ωL = R(f): below it the loop is a resistor,
 * above it an inductor. Solved by bisection in log f (2πfL grows ∝ f while
 * R grows at most ∝ √f, so the root is unique). When δ(f_c) ≥ r this reduces
 * exactly to f_c = R_dc/(2πL).
 *
 * @param length loop perimeter [m]
 * @param r      wire radius [m]
 * @param L      loop inductance [H]
 * @returns crossover frequency [Hz]
 */
export function loopCrossoverFrequency(
  length: number,
  r: number,
  L: number,
  rho: number = RHO_CU,
): number {
  const excess = (f: number) => 2 * Math.PI * f * L - wireResistance(f, length, r, rho);
  let lo = Math.log10(1e-3);
  let hi = Math.log10(1e15);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (excess(10 ** mid) < 0) lo = mid;
    else hi = mid;
  }
  return 10 ** ((lo + hi) / 2);
}
