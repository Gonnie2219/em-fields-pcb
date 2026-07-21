/**
 * 2D FDTD solver, TMz polarization (Ez, Hx, Hy) on a Yee grid.
 *
 * Sources: K. S. Yee, "Numerical solution of initial boundary value problems
 * involving Maxwell's equations in isotropic media", IEEE Trans. Antennas
 * Propag. 14, 302–307 (1966); A. Taflove & S. C. Hagness, Computational
 * Electrodynamics: The Finite-Difference Time-Domain Method, 3rd ed., Artech
 * House (2005), ch. 3 (update equations), §4.7 (Courant stability), ch. 6
 * (analytical ABCs); G. Mur, "Absorbing boundary conditions for the
 * finite-difference approximation of the time-domain electromagnetic-field
 * equations", IEEE Trans. Electromagn. Compat. 23, 377–382 (1981).
 *
 * Model (pedagogical scope, stated in the Module 7 UI):
 *  - 2D TMz: fields are z-invariant. This is the top-down view of a thin
 *    plane pair (Ez between the planes, H in-plane).
 *  - Conductors are PEC (Ez forced to 0) — no conductivity/loss model.
 *  - Dielectrics are lossless, non-dispersive (per-node εr map).
 *  - Boundaries: PEC wall, PMC wall (open plane-pair edge), or first-order
 *    Mur ABC (infinite board).
 *
 * Grid layout (uniform dx = dy, flat arrays, index i + j·nx):
 *  - Ez at integer nodes (i, j), size nx·ny.
 *  - Hx at (i, j+½), size nx·(ny−1), index i + j·nx.
 *  - Hy at (i+½, j), size (nx−1)·ny, index i + j·(nx−1).
 * The PMC wall sits half a cell outside the outermost Ez nodes (the missing
 * outside-H terms are taken as 0), so a PMC-bounded cavity has physical size
 * exactly (nx·dx) × (ny·dx).
 */
import { C_LIGHT, EPS_0, MU_0 } from './constants';

export type FdtdBoundary = 'pec' | 'pmc' | 'mur';

/** Soft (additive) point source: it adds to Ez and never scatters returning waves. */
export interface FdtdSource {
  /** Ez node index in x (0 … nx−1). */
  i: number;
  /** Ez node index in y (0 … ny−1). */
  j: number;
  kind: 'gaussian' | 'cw';
  /** Peak of the per-step additive Ez injection [V/m]. */
  amplitude: number;
  /** Gaussian 1/e half-width σ [s] (kind 'gaussian'). */
  width?: number;
  /** Gaussian center delay [s]; defaults to 4·width (quiet start). */
  t0?: number;
  /** Sinusoid frequency [Hz] (kind 'cw'); raised-cosine turn-on over 3 cycles. */
  frequency?: number;
}

/** Ez recording location (node indices). */
export interface FdtdProbe {
  i: number;
  j: number;
}

export interface FdtdConfig {
  nx: number;
  ny: number;
  /** Cell size dx = dy [m]. */
  dx: number;
  /**
   * Courant number S relative to the 2D stability limit: dt = S·dx/(c·√2)
   * (Taflove & Hagness §4.7: stable for S ≤ 1 on a uniform 2D grid).
   * Default 0.99.
   */
  courant?: number;
  boundary: FdtdBoundary;
  /** Relative permittivity at each Ez node, length nx·ny. Default: vacuum. */
  epsR?: Float32Array;
  /** PEC mask at Ez nodes (1 = perfect conductor, Ez forced to 0), length nx·ny. */
  pec?: Uint8Array;
  sources?: FdtdSource[];
  probes?: FdtdProbe[];
  /** Samples recorded per probe before recording stops. Default 16384. */
  probeCapacity?: number;
  /** Bypass the Courant stability guard (used by the divergence test only). */
  allowUnstable?: boolean;
}

/** Preallocated simulation state. step() never allocates. */
export interface FdtdState {
  nx: number;
  ny: number;
  dx: number;
  dt: number;
  boundary: FdtdBoundary;
  /** Completed time steps; current fields sit at t = n·dt. */
  n: number;
  ez: Float32Array;
  hx: Float32Array;
  hy: Float32Array;
  /** Ez update coefficient dt/(ε0·εr·dx) per node. */
  ce: Float32Array;
  /** H update coefficient dt/(µ0·dx). */
  ch: number;
  epsR: Float32Array;
  pec: Uint8Array;
  /** Flat Ez indices of PEC-masked nodes (precomputed for the zeroing pass). */
  pecIdx: Uint32Array;
  sources: FdtdSource[];
  probes: FdtdProbe[];
  /** One record per probe, filled up to probeCount. */
  probeSeries: Float32Array[];
  probeCount: number;
  probeCapacity: number;
  /** Mur first-order coefficients (c′·dt − dx)/(c′·dt + dx) per edge node. */
  murKL: Float32Array;
  murKR: Float32Array;
  murKB: Float32Array;
  murKT: Float32Array;
  /** Previous-step Ez copies along each edge and its neighbor line (Mur). */
  prevL0: Float32Array;
  prevL1: Float32Array;
  prevR0: Float32Array;
  prevR1: Float32Array;
  prevB0: Float32Array;
  prevB1: Float32Array;
  prevT0: Float32Array;
  prevT1: Float32Array;
}

/**
 * Build a preallocated FDTD state from a config. Throws if the Courant number
 * exceeds the 2D stability limit S = 1 (dt = S·dx/(c·√2)) unless
 * allowUnstable is set, and if material maps or source/probe positions do not
 * match the grid.
 */
export function createSim(config: FdtdConfig): FdtdState {
  const { nx, ny, dx, boundary } = config;
  if (!(nx >= 3 && ny >= 3)) throw new Error('FDTD grid must be at least 3×3');
  if (!(dx > 0)) throw new Error('dx must be positive');
  const S = config.courant ?? 0.99;
  if (S > 1 && !config.allowUnstable) {
    throw new Error(
      `Courant number S = ${S} exceeds the 2D stability limit S ≤ 1 ` +
        '(dt = S·dx/(c·√2)); set allowUnstable to bypass (test use only)',
    );
  }
  const dt = (S * dx) / (C_LIGHT * Math.SQRT2);

  const nn = nx * ny;
  const epsR = new Float32Array(nn);
  if (config.epsR) {
    if (config.epsR.length !== nn) throw new Error('epsR length must be nx·ny');
    epsR.set(config.epsR);
  } else {
    epsR.fill(1);
  }
  const pec = new Uint8Array(nn);
  if (config.pec) {
    if (config.pec.length !== nn) throw new Error('pec length must be nx·ny');
    pec.set(config.pec);
  }
  let nPec = 0;
  for (let k = 0; k < nn; k++) if (pec[k]) nPec++;
  const pecIdx = new Uint32Array(nPec);
  for (let k = 0, m = 0; k < nn; k++) if (pec[k]) pecIdx[m++] = k;

  const ce = new Float32Array(nn);
  for (let k = 0; k < nn; k++) ce[k] = dt / (EPS_0 * epsR[k]! * dx);

  const sources = (config.sources ?? []).map((s) => ({ ...s }));
  for (const s of sources) {
    if (s.i < 0 || s.i >= nx || s.j < 0 || s.j >= ny) throw new Error('source outside grid');
  }
  const probes = (config.probes ?? []).map((p) => ({ ...p }));
  for (const p of probes) {
    if (p.i < 0 || p.i >= nx || p.j < 0 || p.j >= ny) throw new Error('probe outside grid');
  }
  const probeCapacity = config.probeCapacity ?? 16384;

  // Mur coefficient from the local phase speed c′ = c/√εr at each edge node,
  // so the ABC stays matched when the board is filled with dielectric.
  const murK = (k: number) => {
    const cLoc = C_LIGHT / Math.sqrt(epsR[k]!);
    return (cLoc * dt - dx) / (cLoc * dt + dx);
  };
  const murKL = new Float32Array(ny);
  const murKR = new Float32Array(ny);
  for (let j = 0; j < ny; j++) {
    murKL[j] = murK(j * nx);
    murKR[j] = murK(j * nx + nx - 1);
  }
  const murKB = new Float32Array(nx);
  const murKT = new Float32Array(nx);
  for (let i = 0; i < nx; i++) {
    murKB[i] = murK(i);
    murKT[i] = murK((ny - 1) * nx + i);
  }

  return {
    nx,
    ny,
    dx,
    dt,
    boundary,
    n: 0,
    ez: new Float32Array(nn),
    hx: new Float32Array(nx * (ny - 1)),
    hy: new Float32Array((nx - 1) * ny),
    ce,
    ch: dt / (MU_0 * dx),
    epsR,
    pec,
    pecIdx,
    sources,
    probes,
    probeSeries: probes.map(() => new Float32Array(probeCapacity)),
    probeCount: 0,
    probeCapacity,
    murKL,
    murKR,
    murKB,
    murKT,
    prevL0: new Float32Array(ny),
    prevL1: new Float32Array(ny),
    prevR0: new Float32Array(ny),
    prevR1: new Float32Array(ny),
    prevB0: new Float32Array(nx),
    prevB1: new Float32Array(nx),
    prevT0: new Float32Array(nx),
    prevT1: new Float32Array(nx),
  };
}

/** Zero all fields and records; keeps geometry, materials, sources, probes. */
export function resetSim(state: FdtdState): void {
  state.ez.fill(0);
  state.hx.fill(0);
  state.hy.fill(0);
  state.prevL0.fill(0);
  state.prevL1.fill(0);
  state.prevR0.fill(0);
  state.prevR1.fill(0);
  state.prevB0.fill(0);
  state.prevB1.fill(0);
  state.prevT0.fill(0);
  state.prevT1.fill(0);
  state.n = 0;
  state.probeCount = 0;
}

/** Swap the source list without touching the fields (e.g. CW frequency drag). */
export function setSources(state: FdtdState, sources: FdtdSource[]): void {
  for (const s of sources) {
    if (s.i < 0 || s.i >= state.nx || s.j < 0 || s.j >= state.ny) {
      throw new Error('source outside grid');
    }
  }
  state.sources = sources.map((s) => ({ ...s }));
}

/** Soft-source waveform value at time t [s]. */
function sourceValue(s: FdtdSource, t: number): number {
  if (s.kind === 'gaussian') {
    const w = s.width ?? 1e-10;
    const t0 = s.t0 ?? 4 * w;
    const u = (t - t0) / w;
    return s.amplitude * Math.exp(-u * u);
  }
  const f = s.frequency ?? 1e9;
  const tRamp = 3 / f;
  const ramp = t < tRamp ? 0.5 * (1 - Math.cos((Math.PI * t) / tRamp)) : 1;
  return s.amplitude * ramp * Math.sin(2 * Math.PI * f * t);
}

/**
 * Advance the simulation by nSteps leapfrog steps (Yee 1966; Taflove &
 * Hagness ch. 3). Update order per step: H from curl E; Ez from curl H
 * (interior, then boundary per the selected condition); PEC mask; soft
 * sources; probe recording. Allocation-free.
 */
export function step(state: FdtdState, nSteps = 1): void {
  const { nx, ny, ez, hx, hy, ce, ch, boundary, pecIdx, sources, probes, probeSeries, dt } = state;

  for (let sIt = 0; sIt < nSteps; sIt++) {
    // --- H update: ∂Hx/∂t = −(1/µ0)·∂Ez/∂y, ∂Hy/∂t = +(1/µ0)·∂Ez/∂x ---
    for (let j = 0; j < ny - 1; j++) {
      const r = j * nx;
      for (let i = 0; i < nx; i++) {
        hx[r + i] = hx[r + i]! - ch * (ez[r + nx + i]! - ez[r + i]!);
      }
    }
    for (let j = 0; j < ny; j++) {
      const re = j * nx;
      const rh = j * (nx - 1);
      for (let i = 0; i < nx - 1; i++) {
        hy[rh + i] = hy[rh + i]! + ch * (ez[re + i + 1]! - ez[re + i]!);
      }
    }

    // --- Ez update (interior): ∂Ez/∂t = (1/ε)·(∂Hy/∂x − ∂Hx/∂y) ---
    for (let j = 1; j < ny - 1; j++) {
      const re = j * nx;
      const rhy = j * (nx - 1);
      const rhxT = j * nx;
      const rhxB = (j - 1) * nx;
      for (let i = 1; i < nx - 1; i++) {
        const k = re + i;
        ez[k] =
          ez[k]! + ce[k]! * (hy[rhy + i]! - hy[rhy + i - 1]! - hx[rhxT + i]! + hx[rhxB + i]!);
      }
    }

    if (boundary === 'pmc') {
      // Magnetic wall: tangential H just outside the boundary is 0, so the
      // edge Ez updates simply drop the missing outside-H terms. The wall
      // sits half a cell outside the Ez boundary (see header).
      const rT = (ny - 1) * nx;
      const rhyT = (ny - 1) * (nx - 1);
      const rhxTop = (ny - 2) * nx;
      for (let i = 1; i < nx - 1; i++) {
        ez[i] = ez[i]! + ce[i]! * (hy[i]! - hy[i - 1]! - hx[i]!);
        const k = rT + i;
        ez[k] = ez[k]! + ce[k]! * (hy[rhyT + i]! - hy[rhyT + i - 1]! + hx[rhxTop + i]!);
      }
      for (let j = 1; j < ny - 1; j++) {
        const kL = j * nx;
        const kR = kL + nx - 1;
        const rhy = j * (nx - 1);
        ez[kL] = ez[kL]! + ce[kL]! * (hy[rhy]! - hx[j * nx]! + hx[(j - 1) * nx]!);
        ez[kR] =
          ez[kR]! +
          ce[kR]! * (-hy[rhy + nx - 2]! - hx[j * nx + nx - 1]! + hx[(j - 1) * nx + nx - 1]!);
      }
      // Corners: both in-plane H neighbors outside are 0.
      ez[0] = ez[0]! + ce[0]! * (hy[0]! - hx[0]!);
      ez[nx - 1] = ez[nx - 1]! + ce[nx - 1]! * (-hy[nx - 2]! - hx[nx - 1]!);
      ez[rT] = ez[rT]! + ce[rT]! * (hy[rhyT]! + hx[rhxTop]!);
      ez[rT + nx - 1] =
        ez[rT + nx - 1]! + ce[rT + nx - 1]! * (-hy[rhyT + nx - 2]! + hx[rhxTop + nx - 1]!);
    } else if (boundary === 'mur') {
      // First-order Mur ABC (Mur 1981, eq. 5): the boundary node follows the
      // one-way wave equation using the stored previous-step values.
      const { murKL, murKR, murKB, murKT, prevL0, prevL1, prevR0, prevR1, prevB0, prevB1, prevT0, prevT1 } = state;
      for (let j = 1; j < ny - 1; j++) {
        const kL = j * nx;
        const kR = kL + nx - 1;
        ez[kL] = prevL1[j]! + murKL[j]! * (ez[kL + 1]! - prevL0[j]!);
        ez[kR] = prevR1[j]! + murKR[j]! * (ez[kR - 1]! - prevR0[j]!);
      }
      const rT = (ny - 1) * nx;
      for (let i = 0; i < nx; i++) {
        ez[i] = prevB1[i]! + murKB[i]! * (ez[nx + i]! - prevB0[i]!);
        ez[rT + i] = prevT1[i]! + murKT[i]! * (ez[rT - nx + i]! - prevT0[i]!);
      }
      for (let j = 0; j < ny; j++) {
        const kL = j * nx;
        prevL0[j] = ez[kL]!;
        prevL1[j] = ez[kL + 1]!;
        prevR0[j] = ez[kL + nx - 1]!;
        prevR1[j] = ez[kL + nx - 2]!;
      }
      for (let i = 0; i < nx; i++) {
        prevB0[i] = ez[i]!;
        prevB1[i] = ez[nx + i]!;
        prevT0[i] = ez[rT + i]!;
        prevT1[i] = ez[rT - nx + i]!;
      }
    }
    // 'pec': boundary Ez nodes are never updated and stay 0.

    // --- PEC conductors ---
    for (let m = 0; m < pecIdx.length; m++) ez[pecIdx[m]!] = 0;

    // --- Soft sources (additive, at the new time level) ---
    const t = (state.n + 1) * dt;
    for (let m = 0; m < sources.length; m++) {
      const s = sources[m]!;
      const k = s.j * nx + s.i;
      ez[k] = ez[k]! + sourceValue(s, t);
    }

    // --- Probes ---
    if (state.probeCount < state.probeCapacity) {
      for (let m = 0; m < probes.length; m++) {
        probeSeries[m]![state.probeCount] = ez[probes[m]!.j * nx + probes[m]!.i]!;
      }
      state.probeCount++;
    }

    state.n++;
  }
}

/**
 * Total discrete field energy U = ½ε0·Σ εr·Ez²·dx² + ½µ0·Σ(Hx² + Hy²)·dx²
 * [J/m, per meter of z]. E and H are sampled half a step apart, so U
 * oscillates slightly within a period; in a closed lossless (PEC) box it is
 * bounded for a stable scheme (Taflove & Hagness §4.7) — used by the energy
 * boundedness test, not as an exact conserved quantity.
 */
export function totalFieldEnergy(state: FdtdState): number {
  const { ez, hx, hy, epsR, dx } = state;
  let ue = 0;
  for (let k = 0; k < ez.length; k++) ue += epsR[k]! * ez[k]! * ez[k]!;
  let uh = 0;
  for (let k = 0; k < hx.length; k++) uh += hx[k]! * hx[k]!;
  for (let k = 0; k < hy.length; k++) uh += hy[k]! * hy[k]!;
  return 0.5 * dx * dx * (EPS_0 * ue + MU_0 * uh);
}

/**
 * Analytic resonance of an a × b [m] planar (plane-pair) cavity with open
 * (magnetic-wall) edges, mode (m, n):
 *   f_mn = c/(2√εr)·√((m/a)² + (n/b)²)
 * Pozar, Microwave Engineering, 4th ed., Wiley (2012), §6.3 (rectangular
 * resonator; the PMC-walled TMz plane pair has the same mode spectrum).
 */
export function cavityModeFrequency(a: number, b: number, m: number, n: number, epsR: number): number {
  return (C_LIGHT / (2 * Math.sqrt(epsR))) * Math.hypot(m / a, n / b);
}

/** Amplitude spectrum of a real record: freqs [Hz] and |X(f)| (arbitrary units). */
export interface Spectrum {
  freqs: Float64Array;
  mags: Float64Array;
}

/** In-place iterative radix-2 Cooley–Tukey FFT (length must be a power of 2). */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let base = 0; base < n; base += len) {
      let cr = 1;
      let ci = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = base + k;
        const b = a + half;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Hann-windowed, zero-padded amplitude spectrum of a probe record sampled at
 * dt [s]. Hann window (F. J. Harris, "On the use of windows for harmonic
 * analysis with the DFT", Proc. IEEE 66, 51–83 (1978)) suppresses leakage;
 * zero-padding by padFactor interpolates the spectrum for peak picking.
 * Returns bins 0 … fs/2.
 */
export function hannSpectrum(samples: ArrayLike<number>, dt: number, padFactor = 4): Spectrum {
  const n = samples.length;
  let m = 1;
  while (m < n * padFactor) m <<= 1;
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * k) / (n - 1)));
    re[k] = samples[k]! * w;
  }
  fftInPlace(re, im);
  const half = m >> 1;
  const freqs = new Float64Array(half + 1);
  const mags = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    freqs[k] = k / (m * dt);
    mags[k] = Math.hypot(re[k]!, im[k]!);
  }
  return { freqs, mags };
}

/**
 * Dominant spectral peak of a record within [fMin, fMax], refined by
 * parabolic interpolation on the log-magnitude of the three bins around the
 * maximum (J. O. Smith III, Spectral Audio Signal Processing, W3K (2011),
 * "Quadratic interpolation of spectral peaks"). Returns null when the record
 * is too short or the band is empty.
 */
export function peakFrequency(
  samples: ArrayLike<number>,
  dt: number,
  fMin = 0,
  fMax = Infinity,
): number | null {
  if (samples.length < 8) return null;
  const { freqs, mags } = hannSpectrum(samples, dt);
  let kMax = -1;
  let best = 0;
  for (let k = 1; k < mags.length - 1; k++) {
    if (freqs[k]! < fMin || freqs[k]! > fMax) continue;
    if (mags[k]! > best) {
      best = mags[k]!;
      kMax = k;
    }
  }
  if (kMax < 1 || best === 0) return null;
  const a = mags[kMax - 1]!;
  const b = mags[kMax]!;
  const c = mags[kMax + 1]!;
  let delta = 0;
  if (a > 0 && c > 0) {
    const la = Math.log(a);
    const lb = Math.log(b);
    const lc = Math.log(c);
    const den = la - 2 * lb + lc;
    if (den !== 0) delta = (0.5 * (la - lc)) / den;
  }
  const binHz = freqs[1]! - freqs[0]!;
  return freqs[kMax]! + delta * binHz;
}

/**
 * Arrival time [s] of the largest |value| in samples[from … to), refined by
 * parabolic interpolation on |value| — used to time pulse peaks at probes.
 * Sample k is taken at t = (k + 1)·dt (recorded after each update); the
 * constant offset cancels in arrival-time differences.
 */
export function peakArrivalTime(
  samples: ArrayLike<number>,
  dt: number,
  from = 0,
  to = samples.length,
): number {
  let kMax = from;
  let best = -1;
  for (let k = from; k < to; k++) {
    const v = Math.abs(samples[k]!);
    if (v > best) {
      best = v;
      kMax = k;
    }
  }
  let delta = 0;
  if (kMax > 0 && kMax < samples.length - 1) {
    const a = Math.abs(samples[kMax - 1]!);
    const b = Math.abs(samples[kMax]!);
    const c = Math.abs(samples[kMax + 1]!);
    const den = a - 2 * b + c;
    if (den !== 0) delta = (0.5 * (a - c)) / den;
  }
  return (kMax + 1 + delta) * dt;
}
