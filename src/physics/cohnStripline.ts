/**
 * Exact characteristic impedance of zero-thickness symmetric stripline
 * (conformal-mapping solution), used as a validation reference.
 *
 *   Z₀ = (30π/√εr) · K(k′)/K(k),   k = tanh(πw/(2b)),   k′ = sech(πw/(2b))
 *
 * with b the plane-to-plane spacing, w the strip width, and K the complete
 * elliptic integral of the first kind. Note k² + k′² = 1, so k′ is the
 * complementary modulus. (Some texts state the pair with k and k′ swapped;
 * this form gives the physical limits Z₀ → 0 as w/b → ∞ and Z₀ → ∞ as
 * w/b → 0. Check value: w/b = 1, εr = 1 → 65.4 Ω.)
 *
 * Source: S. B. Cohn, "Characteristic Impedance of the Shielded-Strip
 * Transmission Line," IRE Trans. Microwave Theory Tech., vol. MTT-2,
 * pp. 52–57, 1954.
 */

/**
 * Complete elliptic integral of the first kind K(k) (modulus convention),
 * via the arithmetic-geometric mean: K(k) = π / (2·AGM(1, √(1−k²))).
 * Source: Abramowitz & Stegun, Handbook of Mathematical Functions, §17.6.
 */
export function ellipticK(k: number): number {
  let a = 1;
  let g = Math.sqrt(1 - k * k);
  for (let i = 0; i < 60 && Math.abs(a - g) > 1e-15 * a; i++) {
    const an = (a + g) / 2;
    g = Math.sqrt(a * g);
    a = an;
  }
  return Math.PI / (2 * a);
}

/**
 * Cohn's exact Z₀ [Ω] for zero-thickness symmetric stripline.
 *
 * @param w    strip width [m]
 * @param b    plane-to-plane spacing [m]
 * @param epsR dielectric relative permittivity
 */
export function striplineZ0Cohn(w: number, b: number, epsR: number): number {
  const x = (Math.PI * w) / (2 * b);
  const k = Math.tanh(x);
  const kp = 1 / Math.cosh(x);
  return ((30 * Math.PI) / Math.sqrt(epsR)) * (ellipticK(kp) / ellipticK(k));
}
