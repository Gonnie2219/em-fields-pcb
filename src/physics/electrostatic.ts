/**
 * Geometry-agnostic 2D electrostatic solver: ∇·(ε∇φ) = 0 on a rectangular
 * grid, discretized by finite volumes/differences with a cell-centered εr map
 * and face permittivity equal to the mean of the two adjacent cells.
 * Conductors are Dirichlet node regions; un-fixed boundary nodes get natural
 * (zero-flux) Neumann conditions from the missing-link formulation.
 *
 * Solved with red-black Gauss–Seidel + successive over-relaxation (SOR).
 * Source of the scheme: Press et al., "Numerical Recipes" 3rd ed., §20.5
 * (relaxation methods for elliptic PDEs); Chebyshev-optimal ω from eq. 20.5.14.
 *
 * SI units throughout: lengths in m, potentials in V, energy in J/m (per unit
 * length out of plane), capacitance in F/m.
 */
import { EPS_0 } from './constants';

export interface Grid {
  /** Node counts. Node (i, j) sits at (i·dx, j·dy), index j·nx + i. */
  nx: number;
  ny: number;
  /** Node spacing [m]. */
  dx: number;
  dy: number;
}

export interface ElectrostaticProblem {
  grid: Grid;
  /** Cell-centered relative permittivity, length (nx-1)·(ny-1), index j·(nx-1)+i. */
  epsR: Float64Array;
  /** 1 where the node potential is fixed (Dirichlet: conductors/planes), length nx·ny. */
  fixed: Uint8Array;
  /** Potential of fixed nodes [V] (ignored elsewhere), length nx·ny. */
  fixedValue: Float64Array;
}

export interface SolveOptions {
  /**
   * SOR over-relaxation factor. Default: Chebyshev-optimal
   * 2/(1 + sin(π/max(nx, ny))) ≈ 1.9–1.98 for typical grids.
   */
  omega?: number;
  /** Convergence: max node residual / max |fixed potential| < tol. Default 1e-5. */
  tol?: number;
  /** Sweep cap. Default 30000. */
  maxIter?: number;
  /** Warm start: initial φ (copied, not mutated). Dirichlet values are re-imposed. */
  phiInit?: Float64Array;
}

export interface SolveResult {
  phi: Float64Array;
  iterations: number;
  /** Final relative residual (see SolveOptions.tol). */
  residual: number;
}

/**
 * Link (face) conductance-like coefficients for the finite-volume stencil.
 * aH[j·(nx-1)+i] couples nodes (i,j)–(i+1,j): ε_face · (dy_eff/dx), where the
 * face permittivity is the mean of the cells above and below the link and
 * dy_eff is halved on the top/bottom boundary rows. aV analogous for vertical
 * links (i,j)–(i,j+1).
 */
function linkCoefficients(p: ElectrostaticProblem): { aH: Float64Array; aV: Float64Array } {
  const { nx, ny, dx, dy } = p.grid;
  const ncx = nx - 1;
  const ncy = ny - 1;
  const eps = p.epsR;
  const aH = new Float64Array(ncx * ny);
  const aV = new Float64Array(nx * ncy);
  for (let j = 0; j < ny; j++) {
    const below = Math.max(0, j - 1);
    const above = Math.min(ncy - 1, j);
    const hFac = (j === 0 || j === ny - 1 ? 0.5 : 1) * (dy / dx);
    for (let i = 0; i < ncx; i++) {
      aH[j * ncx + i] = 0.5 * (eps[below * ncx + i]! + eps[above * ncx + i]!) * hFac;
    }
  }
  for (let j = 0; j < ncy; j++) {
    for (let i = 0; i < nx; i++) {
      const left = Math.max(0, i - 1);
      const right = Math.min(ncx - 1, i);
      const wFac = (i === 0 || i === nx - 1 ? 0.5 : 1) * (dx / dy);
      aV[j * nx + i] = 0.5 * (eps[j * ncx + left]! + eps[j * ncx + right]!) * wFac;
    }
  }
  return { aH, aV };
}

/**
 * Solve ∇·(ε∇φ) = 0 for the given Dirichlet regions by red-black SOR.
 * Un-fixed edge nodes satisfy ∂φ/∂n = 0 (Neumann) naturally.
 */
export function solveLaplace(p: ElectrostaticProblem, opts: SolveOptions = {}): SolveResult {
  const { nx, ny } = p.grid;
  const n = nx * ny;
  const { aH, aV } = linkCoefficients(p);
  const ncx = nx - 1;
  const omega = opts.omega ?? 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
  const tol = opts.tol ?? 1e-5;
  const maxIter = opts.maxIter ?? 30000;

  const phi = opts.phiInit ? Float64Array.from(opts.phiInit) : new Float64Array(n);
  const fixed = p.fixed;
  for (let k = 0; k < n; k++) if (fixed[k]) phi[k] = p.fixedValue[k]!;

  let vScale = 0;
  for (let k = 0; k < n; k++) if (fixed[k]) vScale = Math.max(vScale, Math.abs(phi[k]!));
  if (vScale === 0) vScale = 1;

  // Precompute the diagonal (sum of link coefficients) once.
  const diag = new Float64Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let d = 0;
      if (i > 0) d += aH[j * ncx + i - 1]!;
      if (i < nx - 1) d += aH[j * ncx + i]!;
      if (j > 0) d += aV[(j - 1) * nx + i]!;
      if (j < ny - 1) d += aV[j * nx + i]!;
      diag[k] = d;
    }
  }

  let iterations = 0;
  let residual = Infinity;
  for (; iterations < maxIter && residual > tol; iterations++) {
    let maxR = 0;
    for (let parity = 0; parity < 2; parity++) {
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = (j + parity) & 1; i < nx; i += 2) {
          const k = row + i;
          if (fixed[k]) continue;
          let s = 0;
          if (i > 0) s += aH[j * ncx + i - 1]! * phi[k - 1]!;
          if (i < nx - 1) s += aH[j * ncx + i]! * phi[k + 1]!;
          if (j > 0) s += aV[(j - 1) * nx + i]! * phi[k - nx]!;
          if (j < ny - 1) s += aV[j * nx + i]! * phi[k + nx]!;
          const r = s / diag[k]! - phi[k]!;
          phi[k] = phi[k]! + omega * r;
          const ar = r < 0 ? -r : r;
          if (ar > maxR) maxR = ar;
        }
      }
    }
    residual = maxR / vScale;
  }
  return { phi, iterations, residual };
}

/**
 * Electrostatic field energy per unit length from the discrete (link-based)
 * energy functional the solver minimizes:
 * W′ = ½ε0 Σ_links ε_face (Δφ)² · (face length / link length)  [J/m].
 * Consistent with the stencil, so C′ = 2W′/V² converges cleanly with the grid.
 */
export function electrostaticEnergy(p: ElectrostaticProblem, phi: Float64Array): number {
  const { nx, ny } = p.grid;
  const ncx = nx - 1;
  const { aH, aV } = linkCoefficients(p);
  let sum = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < ncx; i++) {
      const d = phi[j * nx + i + 1]! - phi[j * nx + i]!;
      sum += aH[j * ncx + i]! * d * d;
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx; i++) {
      const d = phi[(j + 1) * nx + i]! - phi[j * nx + i]!;
      sum += aV[j * nx + i]! * d * d;
    }
  }
  return 0.5 * EPS_0 * sum;
}

/**
 * Capacitance per unit length from field energy: C′ = 2W′/V²  [F/m],
 * with W′ = ½C′V². V is the potential difference between the conductors.
 */
export function capacitancePerLength(p: ElectrostaticProblem, phi: Float64Array, V: number): number {
  return (2 * electrostaticEnergy(p, phi)) / (V * V);
}

/**
 * Cell-centered electric field E = −∇φ [V/m], averaged from the four corner
 * nodes of each cell. For visualization (arrows, |E| heatmaps) and per-region
 * energy accounting; use electrostaticEnergy for C′.
 */
export function cellField(
  grid: Grid,
  phi: Float64Array,
): { ex: Float64Array; ey: Float64Array } {
  const { nx, ny, dx, dy } = grid;
  const ncx = nx - 1;
  const ncy = ny - 1;
  const ex = new Float64Array(ncx * ncy);
  const ey = new Float64Array(ncx * ncy);
  for (let j = 0; j < ncy; j++) {
    for (let i = 0; i < ncx; i++) {
      const p00 = phi[j * nx + i]!;
      const p10 = phi[j * nx + i + 1]!;
      const p01 = phi[(j + 1) * nx + i]!;
      const p11 = phi[(j + 1) * nx + i + 1]!;
      ex[j * ncx + i] = -(p10 - p00 + p11 - p01) / (2 * dx);
      ey[j * ncx + i] = -(p01 - p00 + p11 - p10) / (2 * dy);
    }
  }
  return { ex, ey };
}
