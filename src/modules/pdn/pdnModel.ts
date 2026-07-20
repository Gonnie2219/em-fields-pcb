/**
 * PDN builder model: starter capacitor library, scenario presets, unit
 * parsing/formatting, and target-violation scanning. Physics lives in
 * src/physics/pdn.ts.
 */
import type { CapSpec } from '../../physics/pdn';

export interface CapRow {
  id: string;
  name: string;
  /** Capacitance [F]. */
  C: number;
  esrMohm: number;
  eslNh: number;
  lMountNh: number;
  n: number;
}

/** Mounting-inductance presets — this is Module 1's loop area again. */
export const MOUNT_PRESETS = [
  { label: 'long traces · 2 nH', nH: 2 },
  { label: 'short + vias · 0.8 nH', nH: 0.8 },
  { label: 'via-in-pad · 0.4 nH', nH: 0.4 },
] as const;

export const LIBRARY: CapRow[] = [
  { id: 'c100u', name: '100 µF polymer', C: 100e-6, esrMohm: 30, eslNh: 3, lMountNh: 0.8, n: 1 },
  { id: 'c10u', name: '10 µF 1210', C: 10e-6, esrMohm: 5, eslNh: 1.2, lMountNh: 0.8, n: 2 },
  { id: 'c1u', name: '1 µF 0603', C: 1e-6, esrMohm: 10, eslNh: 0.6, lMountNh: 0.8, n: 4 },
  { id: 'c100n', name: '100 nF 0402', C: 100e-9, esrMohm: 20, eslNh: 0.4, lMountNh: 0.8, n: 10 },
  { id: 'c10n', name: '10 nF 0402', C: 10e-9, esrMohm: 30, eslNh: 0.4, lMountNh: 0.8, n: 4 },
  { id: 'c1n', name: '1 nF 0201', C: 1e-9, esrMohm: 50, eslNh: 0.25, lMountNh: 0.8, n: 2 },
];

export interface Scenario {
  id: string;
  name: string;
  counts: Record<string, number>;
}

export const SCENARIOS: Scenario[] = [
  { id: 'single', name: 'single 100 nF', counts: { c100n: 1 } },
  { id: 'decade', name: 'decade spread', counts: { c100n: 1, c10n: 1, c1n: 1 } },
  { id: 'army', name: 'same-value army (20×)', counts: { c100n: 20 } },
  {
    id: 'bulk',
    name: 'bulk + ceramics',
    counts: { c100u: 1, c10u: 2, c1u: 4, c100n: 10, c10n: 4, c1n: 2 },
  },
];

export function applyScenario(scenario: Scenario): CapRow[] {
  return LIBRARY.map((row) => ({ ...row, n: scenario.counts[row.id] ?? 0 }));
}

export function rowToSpec(row: CapRow, ideal: boolean): CapSpec {
  return ideal
    ? { C: row.C, esr: 0, esl: 0, lMount: 0, n: row.n }
    : {
        C: row.C,
        esr: row.esrMohm * 1e-3,
        esl: row.eslNh * 1e-9,
        lMount: row.lMountNh * 1e-9,
        n: row.n,
      };
}

const PREFIXES: [number, string][] = [
  [1e-12, 'p'],
  [1e-9, 'n'],
  [1e-6, 'µ'],
  [1e-3, 'm'],
  [1, ''],
  [1e3, 'k'],
  [1e6, 'M'],
  [1e9, 'G'],
];

/** 1.5e-7 → "150 n" (engineering notation, no unit). */
export function formatEng(v: number): string {
  if (!Number.isFinite(v) || v === 0) return String(v);
  const abs = Math.abs(v);
  let scale = PREFIXES[0]!;
  for (const p of PREFIXES) if (abs >= p[0] * 0.9999) scale = p;
  const mant = v / scale[0];
  return `${Number(mant.toPrecision(3))} ${scale[1]}`.trim();
}

/** Parse "100n", "0.1 µ", "150nF", "2.2u" → value in base units, or null. */
export function parseEng(text: string): number | null {
  const m = /^\s*([0-9.]+)\s*([pnuµmkMG]?)/.exec(text.replace(',', '.'));
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const mult: Record<string, number> = {
    p: 1e-12,
    n: 1e-9,
    u: 1e-6,
    'µ': 1e-6,
    m: 1e-3,
    k: 1e3,
    M: 1e6,
    G: 1e9,
    '': 1,
  };
  return num * mult[m[2] ?? '']!;
}

export function formatHz(f: number): string {
  if (!Number.isFinite(f)) return '—';
  if (f >= 1e9) return `${(f / 1e9).toFixed(2)} GHz`;
  if (f >= 1e6) return `${(f / 1e6).toFixed(1)} MHz`;
  if (f >= 1e3) return `${(f / 1e3).toFixed(1)} kHz`;
  return `${f.toFixed(0)} Hz`;
}

export function formatOhm(z: number): string {
  if (!Number.isFinite(z)) return '—';
  if (z < 1e-3) return `${(z * 1e6).toFixed(0)} µΩ`;
  if (z < 1) return `${(z * 1e3).toPrecision(3)} mΩ`;
  return `${z.toPrecision(3)} Ω`;
}

export interface Violation {
  f0: number;
  f1: number;
  peakF: number;
  peakZ: number;
}

/** Contiguous frequency ranges where |Z| exceeds the target. */
export function findViolations(
  freqs: Float64Array,
  z: Float64Array,
  target: number,
): Violation[] {
  const out: Violation[] = [];
  let cur: Violation | null = null;
  for (let i = 0; i < freqs.length; i++) {
    if (z[i]! > target) {
      if (!cur) cur = { f0: freqs[i]!, f1: freqs[i]!, peakF: freqs[i]!, peakZ: z[i]! };
      cur.f1 = freqs[i]!;
      if (z[i]! > cur.peakZ) {
        cur.peakZ = z[i]!;
        cur.peakF = freqs[i]!;
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}
