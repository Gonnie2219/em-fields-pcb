/**
 * Module 5 UI model: depth presets (stackup property, from Module 3's
 * presets), the Module 4 mounting-preset comparison geometries, and
 * formatting helpers. Physics lives in src/physics/loopInductance.ts.
 */

/** Depth from mounting surface to nearest plane — Module 3's outer dielectrics. */
export const DEPTH_PRESETS = [
  { id: 'good-si', label: 'good SI · 0.2 mm', mm: 0.2 },
  { id: 'fab', label: 'fab default · 0.36 mm', mm: 0.36 },
  { id: '2l', label: '2-layer · 1.6 mm', mm: 1.6 },
] as const;

/**
 * Geometries meant to be comparable to Module 4's mounting-L presets
 * (2 / 0.8 / 0.4 nH): same 0402-ish span, escape length varies, depth =
 * fab default. Used only for the side-by-side comparison table.
 */
export const MOUNT_COMPARISONS = [
  { presetLabel: 'long traces · 2 nH', presetNh: 2, escapeMm: 3 },
  { presetLabel: 'short + vias · 0.8 nH', presetNh: 0.8, escapeMm: 1 },
  { presetLabel: 'via-in-pad · 0.4 nH', presetNh: 0.4, escapeMm: 0.1 },
] as const;

/** Inductance [H] → "361.9 nH" / "1.20 µH" / "45 pH". */
export function formatL(l: number): string {
  if (!Number.isFinite(l)) return '—';
  if (l >= 1e-6) return `${(l * 1e6).toPrecision(3)} µH`;
  if (l >= 1e-9) return `${(l * 1e9).toPrecision(3)} nH`;
  return `${(l * 1e12).toPrecision(3)} pH`;
}

/** Area [m²] → "100 cm²" / "0.40 mm²". */
export function formatArea(a: number): string {
  if (a >= 1e-4) return `${(a * 1e4).toPrecision(3)} cm²`;
  return `${(a * 1e6).toPrecision(3)} mm²`;
}

/** Length [m] → "10.0 cm" / "3.0 mm" / "66 µm". */
export function formatLen(m: number): string {
  if (m >= 1e-2) return `${(m * 1e2).toPrecision(3)} cm`;
  if (m >= 1e-3) return `${(m * 1e3).toPrecision(3)} mm`;
  return `${(m * 1e6).toPrecision(2)} µm`;
}
