/**
 * Hammerstad–Jensen closed-form microstrip model (zero trace thickness).
 * Used as the reference for validating the numerical solver.
 *
 * Source: E. Hammerstad and Ø. Jensen, "Accurate Models for Microstrip
 * Computer-Aided Design," 1980 IEEE MTT-S International Microwave Symposium
 * Digest, pp. 407–409. Stated accuracy: better than 0.2 % for
 * 0.01 ≤ u ≤ 100 and εr < 128.
 *
 *   u = w/h
 *   ε_eff = (εr+1)/2 + (εr−1)/2 · (1 + 10/u)^(−a·b)
 *     a = 1 + (1/49)·ln[(u⁴ + (u/52)²)/(u⁴ + 0.432)] + (1/18.7)·ln[1 + (u/18.1)³]
 *     b = 0.564·[(εr − 0.9)/(εr + 3)]^0.053
 *   Z₀ = Z₀₁(u)/√ε_eff,  Z₀₁ = (η0/2π)·ln[F/u + √(1 + (2/u)²)]
 *     F = 6 + (2π − 6)·exp(−(30.666/u)^0.7528)
 */

/** Impedance of free space η0 = µ0·c [Ω]. */
const ETA_0 = 376.730313668;

/**
 * Microstrip Z₀ [Ω] and ε_eff for a zero-thickness trace of width w at height
 * h over an infinite ground plane, dielectric εr below the trace, air above.
 *
 * @param u    aspect ratio w/h (dimensionless)
 * @param epsR substrate relative permittivity
 */
export function microstripHammerstadJensen(u: number, epsR: number): { Z0: number; epsEff: number } {
  const a =
    1 +
    Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 +
    Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * ((epsR - 0.9) / (epsR + 3)) ** 0.053;
  const epsEff = (epsR + 1) / 2 + ((epsR - 1) / 2) * (1 + 10 / u) ** (-a * b);
  const F = 6 + (2 * Math.PI - 6) * Math.exp(-((30.666 / u) ** 0.7528));
  const Z01 = (ETA_0 / (2 * Math.PI)) * Math.log(F / u + Math.sqrt(1 + (2 / u) ** 2));
  return { Z0: Z01 / Math.sqrt(epsEff), epsEff };
}
