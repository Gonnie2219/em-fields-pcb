import { EPS_0 } from './constants';

/**
 * Interplane (parallel-plate) capacitance per unit area of a plane pair:
 *
 *   C″ = ε0·εr/d   [F/m²]
 *
 * Fringing at the board edges is neglected — an excellent approximation for
 * plane pairs whose lateral extent is ≫ d. This is the "free", essentially
 * inductance-free HF decoupling capacitance a tightly spaced P–G pair gives.
 * Source: elementary parallel-plate capacitor, e.g. Griffiths,
 * "Introduction to Electrodynamics," 4th ed., §2.5.4.
 *
 * @param epsR dielectric relative permittivity
 * @param d    plane-to-plane spacing [m]
 * @returns capacitance per area [F/m²]
 */
export function interplaneCapacitancePerArea(epsR: number, d: number): number {
  return (EPS_0 * epsR) / d;
}
