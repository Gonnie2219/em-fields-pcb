import { MU_0, RHO_CU } from './constants';

/**
 * Skin depth of a good conductor.
 *
 * δ = √(2ρ / (ωµ)),  ω = 2πf
 *
 * Source: e.g. Pozar, "Microwave Engineering" 4th ed., eq. (1.60);
 * any EM textbook. Valid for good conductors (σ ≫ ωε).
 *
 * Reference values for copper (ρ = 1.68×10⁻⁸ Ω·m, µ = µ0):
 * δ ≈ 65.2 µm at 1 MHz, δ ≈ 2.06 µm at 1 GHz.
 *
 * @param f   frequency [Hz], must be > 0
 * @param rho resistivity [Ω·m] (default: copper)
 * @param mu  permeability [H/m] (default: µ0, valid for non-magnetic conductors)
 * @returns skin depth [m]
 */
export function skinDepth(f: number, rho: number = RHO_CU, mu: number = MU_0): number {
  const omega = 2 * Math.PI * f;
  return Math.sqrt((2 * rho) / (omega * mu));
}
