/**
 * Return-current distribution in the reference plane under a microstrip trace.
 *
 * Model (Module 1): a trace at height h above a plane of width W carries
 * current I; the return current density J(x) in the plane is
 *  - HF limit:  J(x) = I/(π·h) · 1/(1 + (x/h)²)   (image-current result;
 *    current crowds under the trace to minimize loop inductance).
 *    Source: H. Ott, "Electromagnetic Compatibility Engineering" (2009),
 *    eq. 10-1; Johnson & Graham, "High-Speed Digital Design" (1993), §5.3.
 *  - DC limit: uniform, J(x) = I/W (resistance-dominated).
 *  - The two regimes are blended with a logistic weight in log10(f)
 *    centered near 10 kHz. This blend is a PEDAGOGICAL APPROXIMATION —
 *    the true transition depends on plane resistance and geometry.
 *
 * All units SI: x, h, W in meters; f in Hz; I in A; J in A/m
 * (current per unit width of plane).
 */

export interface ReturnCurrentParams {
  /** Trace height above the plane [m] */
  h: number;
  /** Plane width [m] (plane spans x ∈ [-W/2, W/2], trace centered at x = 0) */
  W: number;
  /** Frequency [Hz] */
  f: number;
  /** Total signal current [A] (default 1) */
  I?: number;
}

/**
 * High-frequency return current density (image-current result).
 *
 * J(x) = I/(π·h) · 1/(1 + (x/h)²)
 *
 * Integrates to I over an infinite plane; FWHM = 2h.
 * Source: Ott 2009, eq. 10-1.
 *
 * @param x lateral position from trace centerline [m]
 * @param h trace height above plane [m]
 * @param I total current [A]
 * @returns current density [A/m]
 */
export function returnCurrentDensityHF(x: number, h: number, I = 1): number {
  const u = x / h;
  return I / (Math.PI * h) / (1 + u * u);
}

/**
 * DC-limit return current density: uniform across the plane width
 * (the resistance of the plane dominates; current spreads to minimize R).
 *
 * @param x lateral position [m]
 * @param W plane width [m]
 * @param I total current [A]
 * @returns current density [A/m] (0 outside the plane)
 */
export function returnCurrentDensityDC(x: number, W: number, I = 1): number {
  return Math.abs(x) <= W / 2 ? I / W : 0;
}

/**
 * Logistic blend weight for the HF regime as a function of frequency.
 *
 * w(f) = 1 / (1 + exp(-(log10 f - 4) / 0.7))
 *
 * Centered at 10 kHz (log10 f = 4), transition spanning roughly
 * 100 Hz – 1 MHz (w ≈ 0.05 at 100 Hz, w ≈ 0.95 at 1 MHz).
 * PEDAGOGICAL APPROXIMATION: the real crossover frequency depends on the
 * plane's sheet resistance and the loop geometry; this fixed logistic is
 * chosen only to make the regime change visible and smooth in the UI.
 *
 * @param f frequency [Hz]
 * @returns weight in [0, 1]; 0 → pure DC limit, 1 → pure HF limit
 */
export function hfFraction(f: number): number {
  return 1 / (1 + Math.exp(-(Math.log10(f) - 4) / 0.7));
}

/**
 * Blended return current density J(x) = w·J_HF + (1-w)·J_DC with w = hfFraction(f).
 *
 * @param x lateral position [m]
 * @returns current density [A/m]
 */
export function returnCurrentDensity(x: number, p: ReturnCurrentParams): number {
  const { h, W, f, I = 1 } = p;
  if (Math.abs(x) > W / 2) return 0;
  const w = hfFraction(f);
  return w * returnCurrentDensityHF(x, h, I) + (1 - w) * returnCurrentDensityDC(x, W, I);
}

/** ∫ J_HF dx over [-a, a] for I = 1: (2/π)·atan(a/h). Helper for fractions. */
function hfIntegral(a: number, h: number): number {
  return (2 / Math.PI) * Math.atan(a / h);
}

/**
 * Fraction of the total return current flowing within ±a of the trace
 * centerline, for the blended distribution, normalized to the current
 * actually contained in the finite plane.
 *
 * Analytic: HF part integrates to (2/π)·atan(a/h) (Cauchy/Lorentzian CDF),
 * DC part to 2a/W. In the wide-plane HF limit, a = 3h gives
 * (2/π)·atan(3) ≈ 0.795 — the classic "~80 % within ±3h" result.
 *
 * @param a half-width of the window [m]
 * @returns fraction in [0, 1]
 */
export function fractionWithin(a: number, p: ReturnCurrentParams): number {
  const { h, W, f } = p;
  const aClamped = Math.min(a, W / 2);
  const w = hfFraction(f);
  const num = w * hfIntegral(aClamped, h) + (1 - w) * ((2 * aClamped) / W);
  const den = w * hfIntegral(W / 2, h) + (1 - w) * 1;
  return num / den;
}

/**
 * Current-weighted mean lateral spread ⟨|x|⟩ of the return distribution [m].
 * Used as a qualitative loop-area indicator: the effective current loop per
 * unit length grows with both h and the lateral spread of the return path.
 *
 * Analytic: for the truncated HF (Lorentzian) part,
 * ∫₀^{W/2} x·(2/(πh))/(1+(x/h)²) dx = (h/π)·ln(1 + (W/2h)²);
 * for the uniform DC part ⟨|x|⟩ = W/4.
 *
 * QUALITATIVE indicator only — not a quantitative inductance.
 *
 * @returns mean |x| [m]
 */
export function returnSpread(p: ReturnCurrentParams): number {
  const { h, W, f } = p;
  const w = hfFraction(f);
  const halfW = W / 2;
  const hfNum = (h / Math.PI) * Math.log(1 + (halfW / h) ** 2);
  const hfDen = hfIntegral(halfW, h);
  const num = w * hfNum + (1 - w) * (W / 4);
  const den = w * hfDen + (1 - w) * 1;
  return num / den;
}

/**
 * SCHEMATIC/QUALITATIVE model of a slot cut in the plane under the trace.
 *
 * The current that would have flowed in the slot region [-sw/2, sw/2] is
 * removed and re-deposited as two exponential lobes hugging the slot edges
 * (decay length = h), imitating current squeezing around the slot ends.
 * This is NOT a field solution — it is a cartoon of the real behavior
 * (the actual return path detours along the slot, greatly enlarging the
 * loop). Labeled as schematic in the UI.
 *
 * @param x lateral position [m]
 * @param slotWidth slot width [m], centered under the trace
 * @returns current density [A/m]
 */
export function returnCurrentDensityWithSlot(
  x: number,
  p: ReturnCurrentParams,
  slotWidth: number,
): number {
  const { h, W, f, I = 1 } = p;
  const half = slotWidth / 2;
  if (Math.abs(x) > W / 2) return 0;
  if (Math.abs(x) < half) return 0;
  const w = hfFraction(f);
  // Current removed from the slot region (analytic integral of the blend).
  const removed = I * (w * hfIntegral(half, h) + (1 - w) * (slotWidth / W));
  const lambda = h;
  const lobe = ((removed / 2) * Math.exp(-(Math.abs(x) - half) / lambda)) / lambda;
  return returnCurrentDensity(x, p) + lobe;
}
