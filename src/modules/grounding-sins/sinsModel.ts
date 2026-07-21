/**
 * Module 8 UI model: board/plan-view defaults, the fixed via and stitch-cap
 * parameters, and scenario geometry helpers. Physics lives in
 * src/physics/groundingSins.ts.
 */
import { mountingLoopInductance } from '../../physics/loopInductance';
import { viaInductance } from '../../physics/groundingSins';
import type { CapSpec } from '../../physics/pdn';
import { COPPER_T_MM } from '../stackup/stackupModel';

/** Plan-view board [mm]. */
export const BOARD = { W: 100, H: 60 } as const;

/** Trace route: horizontal at mid-height, endpoint vias at the ends [mm]. */
export const TRACE = { y: 30, x0: 10, x1: 90, wMm: 0.3 } as const;

/** DC plan-view solve grid (~0.5 mm cells, per the module spec). */
export const DC_GRID = { nx: 201, ny: 121 } as const;

/** Stitching via: typical through-board barrel (1.6 mm × ⌀0.25 mm). */
export const VIA = { hMm: 1.6, dMm: 0.25 } as const;
export const L_VIA = viaInductance(VIA.hMm * 1e-3, VIA.dMm * 1e-3);

/**
 * Stitch capacitor: Module 4's 100 nF 0402 (C, ESR, ESL) with Module 5's
 * mounting-loop inductance for a short 0402 layout at fab-default depth.
 */
export const STITCH_CAP_MOUNT_L = mountingLoopInductance({
  span: 1.5e-3,
  escape: 0.5e-3,
  depth: 0.36e-3,
  traceW: 0.3e-3,
  traceT: COPPER_T_MM * 1e-3,
});

export const STITCH_CAP: CapSpec = {
  C: 100e-9,
  esr: 0.02,
  esl: 0.4e-9,
  lMount: STITCH_CAP_MOUNT_L,
  n: 1,
};

export interface ObstacleRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Scenario A slot rectangle [mm]: vertical slot of length `slotLen` and
 * width `slotW` centered at x = slotX, positioned so the trace crosses it at
 * signed offset `crossOffset` from the slot center.
 */
export function slotRect(
  slotX: number,
  slotLen: number,
  slotW: number,
  crossOffset: number,
): ObstacleRect {
  const cy = TRACE.y - crossOffset;
  return { x0: slotX - slotW / 2, x1: slotX + slotW / 2, y0: cy - slotLen / 2, y1: cy + slotLen / 2 };
}

/**
 * Scenario B moat rectangle [mm]: vertical moat of width `moatW` at
 * x = moatX, cut from the top board edge down, leaving the plane joined only
 * below its open end at y = BOARD.H − moatLen.
 */
export function moatRect(moatX: number, moatLen: number, moatW: number): ObstacleRect {
  return { x0: moatX - moatW / 2, x1: moatX + moatW / 2, y0: BOARD.H - moatLen, y1: BOARD.H + 1 };
}

/** The obstacle end (y [mm]) nearer to the trace — the end the return rounds. */
export function nearestEndY(r: ObstacleRect): number {
  const ends = [r.y0, r.y1].filter((y) => y >= 0 && y <= BOARD.H);
  if (ends.length === 0) return r.y0;
  return ends.reduce((a, b) => (Math.abs(a - TRACE.y) <= Math.abs(b - TRACE.y) ? a : b));
}
