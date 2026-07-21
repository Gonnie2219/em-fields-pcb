import type { FdtdSource } from '../../physics/fdtd';
import type { FdtdGridConfig } from './fdtdTypes';

/**
 * All scenarios share one board: 100 × 60 mm at dx = 0.5 mm (200 × 120
 * cells). Under the PMC convention (wall half a cell outside the Ez
 * boundary) the cavity scenario is exactly 100 × 60 mm, so the analytic
 * f_mn table uses a = nx·dx, b = ny·dx.
 */
export const BOARD = { nx: 200, ny: 120, dx: 0.5e-3 };

export type ScenarioId = 'cavity' | 'fence' | 'slot' | 'box';

export interface ScenarioParams {
  epsR: number;
  /** Via-fence post pitch [m]. */
  pitchM: number;
  /** Slot width [m]. */
  slotM: number;
  /** Shield seam gap [m]. */
  gapM: number;
}

export interface ScenarioDef {
  id: ScenarioId;
  label: string;
  /** One-line "what to watch for" caption. */
  watchFor: string;
  defaultSourceKind: 'gaussian' | 'cw';
  defaultCwGHz: number;
  /** Scenario-specific slider, if any. */
  param?: { key: 'pitch' | 'slot' | 'gap'; label: string; minMm: number; maxMm: number };
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'cavity',
    label: 'Plane-pair cavity',
    watchFor:
      'After the pulse, the board keeps ringing: those standing-wave patterns are the ' +
      'cavity modes of the plane pair — watch the probe FFT peak line up with the analytic f₁₀.',
    defaultSourceKind: 'gaussian',
    defaultCwGHz: 0.72,
  },
  {
    id: 'fence',
    label: 'Via fence',
    watchFor:
      'A row of stitching vias is a wall only while the pitch stays well below λ — sweep the ' +
      'frequency (or open the pitch) and watch the fence start to leak.',
    defaultSourceKind: 'cw',
    defaultCwGHz: 1.0,
    param: { key: 'pitch', label: 'Via pitch', minMm: 2, maxMm: 20 },
  },
  {
    id: 'slot',
    label: 'Slot in the plane',
    watchFor:
      'The pulse squeezes through the aperture and re-radiates as a cylindrical wave — the ' +
      'slot has become an antenna fed by the fields (and return currents, Module 1) it interrupts.',
    defaultSourceKind: 'gaussian',
    defaultCwGHz: 1.5,
    param: { key: 'slot', label: 'Slot width', minMm: 1, maxMm: 20 },
  },
  {
    id: 'box',
    label: 'Shielded box with a seam',
    watchFor:
      'A closed PEC box keeps everything inside — until a seam opens. Drag the gap and watch ' +
      'the outside probe: even a thin seam leaks once it is a meaningful fraction of λ.',
    defaultSourceKind: 'cw',
    defaultCwGHz: 1.5,
    param: { key: 'gap', label: 'Seam gap', minMm: 0, maxMm: 10 },
  },
];

/** Source cell per scenario (fence/slot: left half; box: inside the shield). */
const SOURCE_POS: Record<ScenarioId, { i: number; j: number }> = {
  cavity: { i: 62, j: 50 },
  fence: { i: 50, j: 60 },
  slot: { i: 50, j: 60 },
  box: { i: 75, j: 60 },
};

const PROBE_POS: Record<ScenarioId, { i: number; j: number }> = {
  cavity: { i: 144, j: 76 },
  fence: { i: 150, j: 60 },
  slot: { i: 150, j: 60 },
  box: { i: 160, j: 60 },
};

/** Shield rectangle for the 'box' scenario (cell indices, inclusive). */
export const BOX_RECT = { i0: 40, i1: 110, j0: 30, j1: 90 };

/** Wall / fence column for 'fence' and 'slot'. */
export const WALL_I = 100;

/**
 * Build the geometry half of a scenario: uniform-εr substrate, the PEC mask
 * for walls/posts/shields, boundary condition, and the probe. Pure and cheap —
 * rebuilt on every geometry-slider change (which resets the sim).
 */
export function buildGrid(id: ScenarioId, params: ScenarioParams): FdtdGridConfig {
  const { nx, ny, dx } = BOARD;
  const epsR = new Float32Array(nx * ny).fill(params.epsR);
  const pec = new Uint8Array(nx * ny);

  if (id === 'fence') {
    const pitchCells = Math.max(2, Math.round(params.pitchM / dx));
    for (let j = 0; j < ny; j += pitchCells) pec[j * nx + WALL_I] = 1;
  } else if (id === 'slot') {
    const slotCells = Math.max(1, Math.round(params.slotM / dx));
    const j0 = Math.floor(ny / 2 - slotCells / 2);
    for (let j = 0; j < ny; j++) {
      if (j < j0 || j >= j0 + slotCells) pec[j * nx + WALL_I] = 1;
    }
  } else if (id === 'box') {
    const gapCells = Math.round(params.gapM / dx);
    const g0 = Math.floor((BOX_RECT.j0 + BOX_RECT.j1) / 2 - gapCells / 2);
    for (let i = BOX_RECT.i0; i <= BOX_RECT.i1; i++) {
      pec[BOX_RECT.j0 * nx + i] = 1;
      pec[BOX_RECT.j1 * nx + i] = 1;
    }
    for (let j = BOX_RECT.j0; j <= BOX_RECT.j1; j++) {
      const inGap = j >= g0 && j < g0 + gapCells;
      pec[j * nx + BOX_RECT.i0] = 1;
      if (!inGap) pec[j * nx + BOX_RECT.i1] = 1;
    }
  }

  return {
    nx,
    ny,
    dx,
    boundary: id === 'cavity' ? 'pmc' : 'mur',
    epsR,
    pec,
    probes: [PROBE_POS[id]],
  };
}

/**
 * Build the source list for a scenario. The Gaussian "via noise" pulse
 * (σ = 50 ps) has usable spectrum well past 3 GHz on this grid (≥ 90
 * cells/λ at 3 GHz in εr = 4.3).
 */
export function buildSources(
  id: ScenarioId,
  kind: 'gaussian' | 'cw',
  cwFrequency: number,
): FdtdSource[] {
  const pos = SOURCE_POS[id];
  if (kind === 'gaussian') {
    return [{ ...pos, kind: 'gaussian', amplitude: 1, width: 50e-12 }];
  }
  return [{ ...pos, kind: 'cw', amplitude: 1, frequency: cwFrequency }];
}
