/**
 * Canvas color tokens — must stay in sync with the CSS custom properties in
 * styles.css (canvas 2D can't read CSS variables cheaply).
 */
export const COLORS = {
  page: '#0d0d0d',
  surface: '#1a1a19',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  series1: '#3987e5', // blue – primary / blended
  series2: '#199e70', // aqua – HF limit
  series3: '#c98500', // yellow – DC limit, copper
  violet: '#9085e9', // violet – power-plane accents
  hot: '#e66767', // red – warnings (slot)
};

/** Sequential blue ramp for dark surfaces: t = 0 recedes to the surface, t = 1 is bright. */
const RAMP = ['#1a1a19', '#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Map t ∈ [0, 1] to a color on the sequential blue ramp (piecewise-linear RGB). */
export function rampColor(t: number): string {
  const c = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(c));
  const frac = c - i;
  const a = hexToRgb(RAMP[i]!);
  const b = hexToRgb(RAMP[i + 1]!);
  const mix = a.map((v, k) => Math.round(v + (b[k]! - v) * frac));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}
