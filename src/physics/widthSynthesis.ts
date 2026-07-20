/**
 * Trace-width synthesis: find w such that Z₀(w) hits a target, using a
 * closed-form initial guess plus a small, capped number of refinement steps
 * against a caller-supplied numeric Z₀(w) (the field solver). The numeric
 * evaluations are the expensive part, so they are strictly limited.
 */
import { striplineZ0Cohn } from './cohnStripline';
import { microstripHammerstadJensen } from './hammerstadJensen';
import type { TraceGeometry } from './traceGeometry';

/**
 * Closed-form Z₀ estimate for a trace geometry (trace thickness treated as
 * zero): Hammerstad–Jensen for microstrip, Cohn (symmetric, b = h + t +
 * h_above) for stripline variants. Guess quality only — the solver refines.
 */
export function closedFormZ0(g: TraceGeometry): number {
  if (g.kind === 'microstrip') return microstripHammerstadJensen(g.w / g.h, g.epsR).Z0;
  const b = g.h + g.t + (g.hAbove ?? g.h);
  return striplineZ0Cohn(g.w, b, g.epsR);
}

/**
 * Find the width w for a target Z₀. Strategy: bisection on the monotone
 * closed form (cheap) for the initial guess, then at most `maxSolves` calls
 * to `numericZ0` — first at the guess, then a log-space bracketing step, then
 * secant iterations in (ln w, Z₀). Returns the best width evaluated.
 *
 * @param template  geometry whose w is ignored
 * @param target    target impedance [Ω]
 * @param numericZ0 numeric Z₀(w) [Ω] for w [m] (field-solver backed)
 * @param maxSolves cap on numericZ0 evaluations (default 3)
 */
export function widthForZ0(
  template: TraceGeometry,
  target: number,
  numericZ0: (w: number) => number,
  maxSolves = 3,
): { w: number; Z0: number } {
  const href = template.h;
  let lo = 0.05 * href;
  let hi = 30 * href;
  // Closed form is monotone decreasing in w.
  for (let i = 0; i < 48; i++) {
    const mid = Math.sqrt(lo * hi);
    if (closedFormZ0({ ...template, w: mid }) > target) lo = mid;
    else hi = mid;
  }
  const guess = Math.sqrt(lo * hi);

  let w1 = guess;
  let z1 = numericZ0(w1);
  let best = { w: w1, Z0: z1 };
  if (maxSolves < 2 || Math.abs(z1 - target) < 0.25) return best;

  // Second point: log-space step using a typical microstrip/stripline
  // sensitivity dZ₀/d(ln w) ≈ −30…−45 Ω (Z₀ falls as w grows).
  let w2 = w1 * (z1 / target) ** 1.5;
  let z2 = numericZ0(w2);
  if (Math.abs(z2 - target) < Math.abs(best.Z0 - target)) best = { w: w2, Z0: z2 };

  for (let n = 2; n < maxSolves; n++) {
    if (Math.abs(best.Z0 - target) < 0.25 || z2 === z1) break;
    const lnw3 =
      Math.log(w2) + ((target - z2) * (Math.log(w2) - Math.log(w1))) / (z2 - z1);
    const w3 = Math.min(Math.max(Math.exp(lnw3), 0.02 * href), 50 * href);
    const z3 = numericZ0(w3);
    if (Math.abs(z3 - target) < Math.abs(best.Z0 - target)) best = { w: w3, Z0: z3 };
    w1 = w2;
    z1 = z2;
    w2 = w3;
    z2 = z3;
  }
  return best;
}
