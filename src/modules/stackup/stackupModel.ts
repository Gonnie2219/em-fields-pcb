/**
 * Stackup data model, presets, and the mapping from a stackup to per-signal-
 * layer trace geometries for the field solver. Qualitative scorecard rules
 * live here too (they are layout heuristics, not physics — the physics they
 * cite is in src/physics/).
 */
import { interplaneCapacitancePerArea } from '../../physics/planePair';
import type { TraceGeometry } from '../../physics/traceGeometry';

export type LayerRole = 'S' | 'G' | 'P';

export interface Stackup {
  /** Copper layer roles, top → bottom. */
  copper: LayerRole[];
  /** Dielectric thicknesses [mm], top → bottom, length = copper.length − 1. */
  diel: number[];
}

export const COPPER_T_MM = 0.035;
export const TARGET_TOTAL_MM = 1.6;

export interface Preset {
  id: string;
  name: string;
  stackup: Stackup;
}

export const PRESETS: Preset[] = [
  { id: '2l', name: '2-layer', stackup: { copper: ['S', 'G'], diel: [1.53] } },
  {
    id: '4l-good',
    name: '4-layer · good SI',
    stackup: { copper: ['S', 'G', 'P', 'S'], diel: [0.2, 1.06, 0.2] },
  },
  {
    id: '4l-fab',
    name: '4-layer · fab default',
    stackup: { copper: ['S', 'G', 'P', 'S'], diel: [0.36, 0.71, 0.36] },
  },
  {
    id: '6l-good',
    name: '6-layer · good',
    stackup: { copper: ['S', 'G', 'S', 'P', 'G', 'S'], diel: [0.2, 0.2, 0.59, 0.2, 0.2] },
  },
  {
    id: '6l-bad',
    name: '6-layer · bad',
    stackup: { copper: ['S', 'S', 'G', 'P', 'S', 'S'], diel: [0.2, 0.2, 0.59, 0.2, 0.2] },
  },
];

export const ROLE_NAMES: Record<LayerRole, string> = { S: 'signal', G: 'GND', P: 'PWR' };

export function totalThickness(s: Stackup): number {
  return s.copper.length * COPPER_T_MM + s.diel.reduce((a, b) => a + b, 0);
}

export interface RefPlane {
  index: number;
  role: LayerRole;
  /** Dielectric + intermediate-copper distance to the signal layer [mm]. */
  dist: number;
}

export interface SignalLayer {
  index: number;
  refAbove: RefPlane | null;
  refBelow: RefPlane | null;
  /** Nearer of the two references (return-current corridor lives there). */
  nearestRef: RefPlane | null;
  /**
   * 'embedded': buried signal with a single reference, modeled as microstrip
   * (air above) — an approximation, flagged in the UI. 'none': no reference
   * plane at all; Z0 is undefined and no solve is attempted.
   */
  model: 'microstrip' | 'offset-stripline' | 'embedded' | 'none';
  /** Solver geometry (SI), or null when model = 'none'. */
  g: TraceGeometry | null;
}

/** Distance [mm] between copper layers a < b through dielectrics + intermediate copper. */
function layerDistance(s: Stackup, a: number, b: number): number {
  let d = 0;
  for (let k = a; k < b; k++) d += s.diel[k]!;
  for (let k = a + 1; k < b; k++) d += COPPER_T_MM;
  return d;
}

export function analyzeSignalLayers(s: Stackup, wMm: number, epsR: number): SignalLayer[] {
  const n = s.copper.length;
  const t = COPPER_T_MM * 1e-3;
  return s.copper.flatMap((role, i) => {
    if (role !== 'S') return [];
    let refAbove: RefPlane | null = null;
    for (let k = i - 1; k >= 0; k--) {
      if (s.copper[k] !== 'S') {
        refAbove = { index: k, role: s.copper[k]!, dist: layerDistance(s, k, i) };
        break;
      }
    }
    let refBelow: RefPlane | null = null;
    for (let k = i + 1; k < n; k++) {
      if (s.copper[k] !== 'S') {
        refBelow = { index: k, role: s.copper[k]!, dist: layerDistance(s, i, k) };
        break;
      }
    }
    const nearestRef =
      !refAbove ? refBelow
      : !refBelow ? refAbove
      : refAbove.dist <= refBelow.dist ? refAbove : refBelow;

    let model: SignalLayer['model'];
    let g: TraceGeometry | null;
    if (refAbove && refBelow) {
      model = 'offset-stripline';
      g = {
        kind: 'offset-stripline',
        w: wMm * 1e-3,
        t,
        h: refBelow.dist * 1e-3,
        hAbove: refAbove.dist * 1e-3,
        epsR,
      };
    } else if (nearestRef) {
      model = i === 0 || i === n - 1 ? 'microstrip' : 'embedded';
      g = { kind: 'microstrip', w: wMm * 1e-3, t, h: nearestRef.dist * 1e-3, epsR };
    } else {
      model = 'none';
      g = null;
    }
    return [{ index: i, refAbove, refBelow, nearestRef, model, g }];
  });
}

export interface PlanePair {
  top: number;
  bottom: number;
  dMm: number;
}

/** Adjacent P–G pairs (consecutive copper layers of opposite plane roles). */
export function planePairs(s: Stackup): PlanePair[] {
  const out: PlanePair[] = [];
  for (let i = 0; i < s.copper.length - 1; i++) {
    const a = s.copper[i]!;
    const b = s.copper[i + 1]!;
    if (a !== 'S' && b !== 'S' && a !== b) out.push({ top: i, bottom: i + 1, dMm: s.diel[i]! });
  }
  return out;
}

export interface ScoreEntry {
  status: 'good' | 'warn' | 'bad';
  text: string;
}

const layerList = (ix: number[]) => ix.map((i) => `L${i + 1}`).join(', ');

export function scorecard(s: Stackup, epsR: number): ScoreEntry[] {
  const entries: ScoreEntry[] = [];
  const n = s.copper.length;

  // 1. Every signal layer has an adjacent reference plane
  const orphans: number[] = [];
  s.copper.forEach((r, i) => {
    if (r !== 'S') return;
    const neighbors = [s.copper[i - 1], s.copper[i + 1]].filter(Boolean) as LayerRole[];
    if (!neighbors.some((x) => x !== 'S')) orphans.push(i);
  });
  if (orphans.length === 0) {
    entries.push({
      status: 'good',
      text: 'Every signal layer has a plane right next door — return current flows directly under each trace, keeping loops tiny (Module 1).',
    });
  } else {
    entries.push({
      status: 'bad',
      text: `${layerList(orphans)}: no adjacent reference plane — the return current must find a distant path, so the loop area, inductance, crosstalk and radiation all balloon.`,
    });
  }

  // 2. Adjacent signal layers → broadside coupling
  const broadside: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (s.copper[i] === 'S' && s.copper[i + 1] === 'S') broadside.push(`L${i + 1}/L${i + 2}`);
  }
  if (broadside.length) {
    entries.push({
      status: 'warn',
      text: `${broadside.join(', ')} are facing signal layers — parallel traces there couple broadside over their whole length, the worst crosstalk geometry.`,
    });
  } else {
    entries.push({
      status: 'good',
      text: 'No two signal layers face each other — no broadside coupling risk.',
    });
  }

  // 3. Outer signal layers → EMI exposure
  const outerS = [0, n - 1].filter((i) => s.copper[i] === 'S');
  if (outerS.length) {
    entries.push({
      status: 'warn',
      text: `${layerList(outerS)} are surface layers — their fields extend into free space, so fast edges there radiate directly (route the fastest signals on inner layers).`,
    });
  } else {
    entries.push({
      status: 'good',
      text: 'All signal layers are buried — trace fields stay inside the board instead of radiating.',
    });
  }

  // 4. P–G pair spacing → interplane capacitance quality
  const pairs = planePairs(s);
  if (!pairs.length) {
    entries.push({
      status: 'warn',
      text: 'No adjacent power–ground plane pair — zero “free” interplane capacitance, so every bit of HF decoupling must come from discrete capacitors (Module 4).',
    });
  } else {
    const best = pairs.reduce((a, b) => (a.dMm <= b.dMm ? a : b));
    const pFcm2 = interplaneCapacitancePerArea(epsR, best.dMm * 1e-3) * 1e12 * 1e-4;
    if (best.dMm <= 0.3) {
      entries.push({
        status: 'good',
        text: `P–G pair only ${best.dMm.toFixed(2)} mm apart → ${pFcm2.toFixed(1)} pF/cm² of distributed, essentially inductance-free HF capacitance.`,
      });
    } else {
      entries.push({
        status: 'warn',
        text: `P–G planes ${best.dMm.toFixed(2)} mm apart → only ${pFcm2.toFixed(1)} pF/cm²; the thick core pushes the planes apart, so mid-frequency charge must come from discrete capacitors (Module 4).`,
      });
    }
  }

  return entries;
}
