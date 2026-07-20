/**
 * Quasi-TEM transmission-line parameters from the two-solve capacitance
 * method: solve the electrostatic cross-section once with the real dielectric
 * (→ C′) and once with all εr = 1 (→ C′₀). Because (non-magnetic) dielectrics
 * do not affect inductance, L′ follows from the vacuum solve alone:
 *
 *   L′ = 1/(c²·C′₀)        Z₀ = √(L′/C′) = 1/(c·√(C′·C′₀))
 *   ε_eff = C′/C′₀         v_p = 1/√(L′C′) = c/√ε_eff
 *
 * Source: C. R. Paul, "Analysis of Multiconductor Transmission Lines,"
 * 2nd ed. (2008), §3.1 (per-unit-length parameters of quasi-TEM lines);
 * Collin, "Foundations for Microwave Engineering," 2nd ed., §3.9.
 */
import { C_LIGHT } from './constants';

export interface LineParams {
  /** Capacitance per length with dielectric [F/m]. */
  C: number;
  /** Capacitance per length with all εr = 1 [F/m]. */
  C0: number;
  /** Inductance per length [H/m]. */
  L: number;
  /** Characteristic impedance [Ω]. */
  Z0: number;
  /** Effective relative permittivity. */
  epsEff: number;
  /** Phase velocity [m/s]. */
  vP: number;
}

/** Derive all quasi-TEM line parameters from the two capacitances [F/m]. */
export function lineParamsFromCapacitance(C: number, C0: number): LineParams {
  const L = 1 / (C_LIGHT * C_LIGHT * C0);
  const Z0 = 1 / (C_LIGHT * Math.sqrt(C * C0));
  const epsEff = C / C0;
  const vP = C_LIGHT / Math.sqrt(epsEff);
  return { C, C0, L, Z0, epsEff, vP };
}
