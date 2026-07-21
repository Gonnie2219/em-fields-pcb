import { describe, expect, it } from 'vitest';
import { C_LIGHT } from './constants';
import {
  cavityModeFrequency,
  createSim,
  hannSpectrum,
  peakArrivalTime,
  peakFrequency,
  step,
  totalFieldEnergy,
  type FdtdConfig,
  type FdtdSource,
} from './fdtd';

/**
 * Quasi-1D propagation rig: a long, narrow PMC-bounded strip with a uniform
 * column of soft sources, so the field is exactly y-invariant and the pulse
 * is a clean 1D plane wave (no 2D wake). Probes sit far enough from the PMC
 * end walls that every window below closes before the first reflection's
 * leading tail (3σ ahead of its center) can arrive.
 */
function propagationRig(epsR: number, steps: number) {
  const nx = 800;
  const ny = 8;
  const dx = 1e-3;
  const dt = (0.99 * dx) / (C_LIGHT * Math.SQRT2);
  const width = 20 * dt;
  const sources: FdtdSource[] = [];
  for (let j = 0; j < ny; j++) {
    sources.push({ i: 100, j, kind: 'gaussian', amplitude: 1, width });
  }
  const epsMap = new Float32Array(nx * ny).fill(epsR);
  const sim = createSim({
    nx,
    ny,
    dx,
    boundary: 'pmc',
    epsR: epsMap,
    sources,
    probes: [
      { i: 300, j: 4 },
      { i: 600, j: 4 },
    ],
  });
  step(sim, steps);
  return sim;
}

describe('FDTD propagation speed', () => {
  it('vacuum: pulse peak travels at c within 2%', () => {
    const sim = propagationRig(1, 1000);
    // Reflection tails reach probe 1 no earlier than step ~591, probe 2 ~1021.
    const t1 = peakArrivalTime(sim.probeSeries[0]!, sim.dt, 0, 560);
    const t2 = peakArrivalTime(sim.probeSeries[1]!, sim.dt, 0, 1000);
    const speed = (300 * 1e-3) / (t2 - t1);
    expect(Math.abs(speed - C_LIGHT) / C_LIGHT).toBeLessThan(0.02);
  });

  it('uniform εr = 4: pulse peak travels at c/2 within 2%', () => {
    const sim = propagationRig(4, 1900);
    // Travel time doubles; first reflection tails: probe 1 ~1165, probe 2 ~2023.
    const t1 = peakArrivalTime(sim.probeSeries[0]!, sim.dt, 0, 1100);
    const t2 = peakArrivalTime(sim.probeSeries[1]!, sim.dt, 0, 1900);
    const speed = (300 * 1e-3) / (t2 - t1);
    expect(Math.abs(speed - C_LIGHT / 2) / (C_LIGHT / 2)).toBeLessThan(0.02);
  });
});

describe('FDTD stability (Courant condition)', () => {
  const base: FdtdConfig = {
    nx: 60,
    ny: 60,
    dx: 1e-3,
    boundary: 'pec',
    sources: [{ i: 30, j: 30, kind: 'gaussian', amplitude: 1, width: 10 * 2.33e-12 }],
  };

  it('S = 0.99 stays finite and bounded over 5000 steps', () => {
    const sim = createSim(base);
    step(sim, 5000);
    let max = 0;
    for (let k = 0; k < sim.ez.length; k++) max = Math.max(max, Math.abs(sim.ez[k]!));
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeLessThan(1e3);
  });

  it('createSim rejects S > 1', () => {
    expect(() => createSim({ ...base, courant: 1.05 })).toThrow(/stability limit/);
  });

  it('S = 1.05 diverges (the guard is not paranoia)', () => {
    const sim = createSim({ ...base, nx: 40, ny: 40, courant: 1.05, allowUnstable: true });
    step(sim, 400);
    let max = 0;
    for (let k = 0; k < sim.ez.length; k++) max = Math.max(max, Math.abs(sim.ez[k]!));
    expect(!Number.isFinite(max) || max > 1e6).toBe(true);
  });
});

describe('Mur first-order ABC', () => {
  it('residual reflection at a probe < 5% of the incident peak', () => {
    // Reference methodology: identical source and probe placement on a much
    // larger PEC grid whose walls cannot causally reach the probe inside the
    // comparison window. The difference of the two runs isolates the ABC
    // reflection (the outgoing wave and its 2D wake cancel exactly).
    // Window: direct pulse (peak ~160, tail ~205) plus the normal-incidence
    // reflection off the near wall (center ~243, tail ~288); closes before
    // oblique top/bottom-wall reflections arrive (tails from ~318), which are
    // outside the first-order ABC's normal-incidence design point.
    const dx = 1e-3;
    const dt = (0.99 * dx) / (C_LIGHT * Math.SQRT2);
    const width = 15 * dt;
    const T = 310;
    const src = { kind: 'gaussian' as const, amplitude: 1, width };

    const mur = createSim({
      nx: 200,
      ny: 200,
      dx,
      boundary: 'mur',
      sources: [{ ...src, i: 100, j: 100 }],
      probes: [{ i: 170, j: 100 }],
    });
    step(mur, T);

    const ref = createSim({
      nx: 400,
      ny: 400,
      dx,
      boundary: 'pec',
      sources: [{ ...src, i: 200, j: 200 }],
      probes: [{ i: 270, j: 200 }],
    });
    step(ref, T);

    let incident = 0;
    let residual = 0;
    for (let k = 0; k < T; k++) {
      incident = Math.max(incident, Math.abs(ref.probeSeries[0]![k]!));
      residual = Math.max(residual, Math.abs(mur.probeSeries[0]![k]! - ref.probeSeries[0]![k]!));
    }
    expect(incident).toBeGreaterThan(0);
    expect(residual / incident).toBeLessThan(0.05);
  });
});

describe('plane-pair cavity resonance', () => {
  it('cavityModeFrequency: 100×60 mm, εr = 4.3 → f10 ≈ 722.9 MHz, f11 ≈ 1405 MHz', () => {
    // f10 = c/(2√4.3·0.1) = 2.99792458e8/0.41473 = 722.86 MHz (hand value).
    expect(cavityModeFrequency(0.1, 0.06, 1, 0, 4.3) / 722.86e6).toBeCloseTo(1, 3);
    expect(cavityModeFrequency(0.1, 0.06, 1, 1, 4.3) / 1.405e9).toBeCloseTo(1, 2);
  });

  it('probe FFT of the downscaled cavity finds f10 within 3% of analytic', () => {
    // 50×30 cells at dx = 2 mm: with the PMC wall half a cell outside the Ez
    // boundary the cavity is exactly 100 × 60 mm. Source and probe are off
    // center and off the nodal lines of the (1,0) and (0,1) modes.
    const nx = 50;
    const ny = 30;
    const dx = 2e-3;
    const epsR = new Float32Array(nx * ny).fill(4.3);
    const sim = createSim({
      nx,
      ny,
      dx,
      boundary: 'pmc',
      epsR,
      sources: [{ i: 15, j: 12, kind: 'gaussian', amplitude: 1, width: 100e-12 }],
      probes: [{ i: 36, j: 19 }],
      probeCapacity: 8192,
    });
    step(sim, 8192);
    const f10 = cavityModeFrequency(0.1, 0.06, 1, 0, 4.3);
    const measured = peakFrequency(sim.probeSeries[0]!, sim.dt, 0.4e9, 1.0e9);
    expect(measured).not.toBeNull();
    expect(Math.abs(measured! - f10) / f10).toBeLessThan(0.03);
  });
});

describe('energy boundedness (closed lossless PEC box)', () => {
  it('no growth over 10000 steps after the source turns off', () => {
    const dx = 1e-3;
    const dt = (0.99 * dx) / (C_LIGHT * Math.SQRT2);
    const sim = createSim({
      nx: 80,
      ny: 80,
      dx,
      boundary: 'pec',
      sources: [{ i: 40, j: 40, kind: 'gaussian', amplitude: 1, width: 12 * dt }],
    });
    // Source is fully decayed after ~100 steps; reference the early plateau
    // (E and H are sampled a half step apart, so the sum oscillates slightly).
    step(sim, 200);
    const early = [totalFieldEnergy(sim)];
    for (let b = 0; b < 2; b++) {
      step(sim, 500);
      early.push(totalFieldEnergy(sim));
    }
    const ref = Math.max(...early);
    for (let b = 0; b < 18; b++) {
      step(sim, 500);
      const u = totalFieldEnergy(sim);
      expect(Number.isFinite(u)).toBe(true);
      expect(u).toBeLessThan(ref * 1.02);
    }
  });
});

describe('spectrum helpers', () => {
  it('peakFrequency recovers an off-bin sinusoid within 0.1%', () => {
    const dt = 1e-9;
    const f = 12.3456e6;
    const samples = new Float32Array(4096);
    for (let k = 0; k < samples.length; k++) samples[k] = Math.sin(2 * Math.PI * f * (k * dt));
    const got = peakFrequency(samples, dt, 1e6, 100e6);
    expect(got).not.toBeNull();
    expect(Math.abs(got! - f) / f).toBeLessThan(1e-3);
  });

  it('hannSpectrum places the maximum bin at the sinusoid frequency', () => {
    const dt = 1e-9;
    const f = 25e6;
    const samples = new Float32Array(2048);
    for (let k = 0; k < samples.length; k++) samples[k] = Math.sin(2 * Math.PI * f * (k * dt));
    const { freqs, mags } = hannSpectrum(samples, dt);
    let kMax = 1;
    for (let k = 1; k < mags.length; k++) if (mags[k]! > mags[kMax]!) kMax = k;
    expect(Math.abs(freqs[kMax]! - f) / f).toBeLessThan(0.05);
  });
});
