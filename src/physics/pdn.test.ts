import { describe, expect, it } from 'vitest';
import { interplaneCapacitancePerArea } from './planePair';
import {
  capImpedance,
  localMaxima,
  logspace,
  pdnImpedance,
  planeBranch,
  selfResonantFrequency,
  targetImpedance,
  totalInductance,
  zMag,
  type CapSpec,
} from './pdn';

const cap = (over: Partial<CapSpec>): CapSpec => ({
  C: 100e-9,
  esr: 0.02,
  esl: 0.4e-9,
  lMount: 0.8e-9,
  n: 1,
  ...over,
});

describe('capImpedance asymptotes (ESR = 0)', () => {
  const s = cap({ esr: 0 });
  const srf = selfResonantFrequency(s);

  it('f ≪ SRF: |Z| within 1% of 1/(ωC)', () => {
    for (const f of [srf / 20, srf / 100, srf / 1000]) {
      const omega = 2 * Math.PI * f;
      const z = zMag(capImpedance(s, omega));
      expect(Math.abs(z - 1 / (omega * s.C)) / (1 / (omega * s.C))).toBeLessThan(0.01);
    }
  });

  it('f ≫ SRF: |Z| within 1% of ω·L_total', () => {
    for (const f of [srf * 20, srf * 100]) {
      const omega = 2 * Math.PI * f;
      const z = zMag(capImpedance(s, omega));
      const ideal = omega * totalInductance(s);
      expect(Math.abs(z - ideal) / ideal).toBeLessThan(0.01);
    }
  });
});

describe('self-resonance', () => {
  it('|Z(SRF)| = ESR', () => {
    const s = cap({ esr: 0.03 });
    const z = zMag(capImpedance(s, 2 * Math.PI * selfResonantFrequency(s)));
    expect(z).toBeCloseTo(0.03, 9);
  });

  it('the |Z| minimum on a 1000-point grid sits within one grid step of SRF', () => {
    const s = cap({});
    const srf = selfResonantFrequency(s);
    const freqs = logspace(1e3, 1e9, 1000);
    let best = 0;
    let bestZ = Infinity;
    freqs.forEach((f, i) => {
      const z = zMag(capImpedance(s, 2 * Math.PI * f));
      if (z < bestZ) {
        bestZ = z;
        best = i;
      }
    });
    const step = Math.log10(freqs[1]! / freqs[0]!);
    expect(Math.abs(Math.log10(freqs[best]! / srf))).toBeLessThan(step);
  });
});

describe('parallel networks', () => {
  it('n identical caps → |Z|/n across the band', () => {
    const one = cap({});
    const twenty = cap({ n: 20 });
    for (const f of logspace(1e3, 1e9, 50)) {
      const omega = 2 * Math.PI * f;
      const zSingle = zMag(pdnImpedance([one], omega));
      const zArmy = zMag(pdnImpedance([twenty], omega));
      expect(zArmy).toBeCloseTo(zSingle / 20, 12);
    }
  });

  it('empty network → infinite impedance', () => {
    expect(zMag(pdnImpedance([cap({ n: 0 })], 1e6))).toBe(Infinity);
  });
});

describe('decade spread anti-resonance', () => {
  const decade = (esrScale: number): CapSpec[] => [
    cap({ C: 100e-9, esr: 0.02 * esrScale }),
    cap({ C: 10e-9, esr: 0.03 * esrScale }),
    cap({ C: 1e-9, esr: 0.05 * esrScale, esl: 0.25e-9 }),
  ];
  const freqs = logspace(1e3, 1e9, 1000);
  const curve = (specs: CapSpec[]) =>
    Float64Array.from(freqs, (f) => zMag(pdnImpedance(specs, 2 * Math.PI * f)));

  it('a local max exists between adjacent SRFs', () => {
    const specs = decade(1);
    const [srf1, srf2] = [selfResonantFrequency(specs[0]!), selfResonantFrequency(specs[1]!)];
    const z = curve(specs);
    const peaks = localMaxima(z).map((i) => freqs[i]!);
    expect(peaks.some((f) => f > srf1 && f < srf2)).toBe(true);
  });

  it('raising ESR strictly lowers the anti-resonance peak', () => {
    const specsLo = decade(1);
    const specsHi = decade(3);
    const [srf1, srf2] = [selfResonantFrequency(specsLo[0]!), selfResonantFrequency(specsLo[1]!)];
    const inWindowMax = (z: Float64Array) => {
      let m = 0;
      freqs.forEach((f, i) => {
        if (f > srf1 && f < srf2 && z[i]! > m) m = z[i]!;
      });
      return m;
    };
    expect(inWindowMax(curve(specsHi))).toBeLessThan(inWindowMax(curve(specsLo)));
  });
});

describe('targetImpedance', () => {
  it('1 V rail, 5% ripple, 2 A step → 25 mΩ', () => {
    expect(targetImpedance(1, 0.05, 2)).toBeCloseTo(0.025, 12);
  });
});

describe('planeBranch', () => {
  it('capacitance identical to Module 3 C″ × area', () => {
    const b = planeBranch(4.4, 0.2e-3, 0.01, 10e-12);
    expect(b.C).toBe(interplaneCapacitancePerArea(4.4, 0.2e-3) * 0.01);
    expect(totalInductance(b)).toBe(10e-12);
    // 100 × 100 mm at 0.2 mm FR4 ≈ 1.95 nF
    expect(b.C * 1e9).toBeCloseTo(1.95, 2);
  });
});
