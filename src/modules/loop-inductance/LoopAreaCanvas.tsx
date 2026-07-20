import { useCallback } from 'react';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';
import { formatArea, formatLen } from './loopModel';

/** All geometry in meters (SI); converted to pixels here only. */
export type LoopScene =
  | { kind: 'wire-loop'; a: number; b: number }
  | { kind: 'wire-pair'; D: number; r: number }
  | { kind: 'trace-plane'; w: number; h: number }
  | { kind: 'mounting'; span: number; escape: number; depth: number };

const HEIGHT = 240;
const AREA_FILL = 'rgba(57, 135, 229, 0.20)';
const AREA_EDGE = 'rgba(57, 135, 229, 0.6)';

/**
 * Geometry roughly to scale with the enclosed LOOP AREA shaded — the shaded
 * area is the star of this module. One drawing per scenario.
 */
export function LoopAreaCanvas({ scene }: { scene: LoopScene }) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';
      if (scene.kind === 'wire-loop') drawWireLoop(ctx, cw, scene.a, scene.b);
      else if (scene.kind === 'wire-pair') drawWirePair(ctx, cw, scene.D, scene.r);
      else if (scene.kind === 'trace-plane') drawTracePlane(ctx, cw, scene.w, scene.h);
      else drawMounting(ctx, cw, scene.span, scene.escape, scene.depth);
    },
    [scene],
  );
  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}

function shadeArea(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = AREA_FILL;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = AREA_EDGE;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

function areaLabel(ctx: CanvasRenderingContext2D, cx: number, cy: number, area: number) {
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(`loop area ${formatArea(area)}`, cx, cy);
  ctx.font = '11px system-ui, sans-serif';
}

/** Face-on rectangular wire loop a × b, drawn to scale. */
function drawWireLoop(ctx: CanvasRenderingContext2D, cw: number, a: number, b: number) {
  const m = 46;
  const s = Math.min((cw - 2 * m) / a, (HEIGHT - 2 * m) / b);
  const w = a * s;
  const h = b * s;
  const x = (cw - w) / 2;
  const y = (HEIGHT - h) / 2;

  shadeArea(ctx, x, y, w, h);
  ctx.strokeStyle = COLORS.series3;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  areaLabel(ctx, cw / 2, y + h / 2 + 4, a * b);

  drawHDim(ctx, x, x + w, y + h + 18, `a = ${formatLen(a)}`);
  drawVDim(ctx, x - 14, y, y + h, `b = ${formatLen(b)}`);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('to scale (wire ⌀ exaggerated)', cw - 8, 14);
}

/** Side view of a 1 cm segment of a parallel wire pair, spacing D to scale. */
function drawWirePair(ctx: CanvasRenderingContext2D, cw: number, D: number, r: number) {
  const seg = 0.01; // 1 cm of line shown
  const m = 50;
  const s = Math.min((HEIGHT - 2 * m) / D, (cw - 2 * m) / (seg * 1.6));
  const segPx = seg * s;
  const dPx = D * s;
  const wirePx = Math.max(3, 2 * r * s);
  const x = (cw - segPx) / 2;
  const yTop = (HEIGHT - dPx) / 2;

  shadeArea(ctx, x, yTop, segPx, dPx);
  ctx.fillStyle = COLORS.series3;
  ctx.fillRect(x - 24, yTop - wirePx / 2, segPx + 48, wirePx);
  ctx.fillRect(x - 24, yTop + dPx - wirePx / 2, segPx + 48, wirePx);
  // Continuation marks: the line keeps going
  ctx.strokeStyle = COLORS.muted;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  for (const yy of [yTop, yTop + dPx]) {
    ctx.beginPath();
    ctx.moveTo(x - 44, yy);
    ctx.lineTo(x - 26, yy);
    ctx.moveTo(x + segPx + 26, yy);
    ctx.lineTo(x + segPx + 44, yy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Current direction arrows: go on top, return on bottom
  ctx.fillStyle = COLORS.ink2;
  ctx.textAlign = 'left';
  ctx.fillText('I →', x + segPx + 50, yTop + 4);
  ctx.fillText('← I (return)', x + segPx + 50, yTop + dPx + 4);

  areaLabel(ctx, cw / 2, yTop + dPx / 2 + 4, D * seg);
  drawVDim(ctx, x - 14, yTop, yTop + dPx, `D = ${formatLen(D)}`);
  drawHDim(ctx, x, x + segPx, yTop + dPx + Math.max(18, wirePx), 'ℓ = 1 cm');
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('side view, to scale · loop closes far away at both ends', cw - 8, 14);
}

/** Cross-section of a trace at height h over a plane (vertical exaggerated). */
function drawTracePlane(ctx: CanvasRenderingContext2D, cw: number, w: number, h: number) {
  const padX = 40;
  const spanM = Math.max(4 * w, w + 10 * h); // plane width drawn
  const sx = (cw - 2 * padX) / spanM;
  const sy = Math.min(56 / (h * 1e3), 60000); // ≤ 56 px per mm of height
  const yPlane = 176;
  const planeThick = 10;
  const traceThick = 7;
  const wPx = Math.max(3, w * sx);
  const hPx = Math.max(14, h * 1e3 * sy);
  const cx = cw / 2;
  const yTrace = yPlane - hPx;

  // Fringing hint: dashed bulges beside the parallel-plate slab
  ctx.strokeStyle = AREA_EDGE;
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + (sgn * wPx) / 2, yPlane, hPx * 1.4, hPx, 0, -Math.PI / 2, Math.PI / 2, sgn < 0);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  shadeArea(ctx, cx - wPx / 2, yTrace, wPx, hPx);
  ctx.fillStyle = COLORS.series3;
  ctx.fillRect(cx - wPx / 2, yTrace - traceThick, wPx, traceThick);
  ctx.fillRect(padX, yPlane, cw - 2 * padX, planeThick);

  ctx.fillStyle = COLORS.ink2;
  ctx.textAlign = 'left';
  ctx.fillText('fringing flux', cx + wPx / 2 + hPx * 1.5 + 6, yPlane - hPx / 2);

  areaLabel(ctx, cx, yTrace + hPx / 2 + 4, w * h);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText(`w = ${formatLen(w)}`, cx, yTrace - traceThick - 8);
  drawVDim(ctx, cx - wPx / 2 - 14, yTrace, yPlane, `h = ${formatLen(h)}`);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('cross-section · vertical exaggerated · shaded = per-length flux window w × h', cw - 8, 14);
}

/** Side view of a capacitor mounting loop: pads, escape traces, vias, plane. */
function drawMounting(
  ctx: CanvasRenderingContext2D,
  cw: number,
  span: number,
  escape: number,
  depth: number,
) {
  const loopLen = span + 2 * escape;
  const padX = 60;
  const sx = (cw - 2 * padX) / (loopLen * 1.5);
  const sy = 68 / 1.6e-3; // fixed vertical scale: 1.6 mm depth → 68 px
  const ySurface = 118;
  const copperT = 6;
  const yPlane = ySurface + Math.max(12, depth * sy);
  const cx = cw / 2;
  const spanPx = span * sx;
  const escPx = escape * sx;
  const loopPx = loopLen * sx;
  const viaW = 5;

  shadeArea(ctx, cx - loopPx / 2, ySurface + copperT, loopPx, yPlane - ySurface - copperT);

  // Plane
  ctx.fillStyle = COLORS.series3;
  ctx.fillRect(padX, yPlane, cw - 2 * padX, 9);
  // Escape traces + pads on the surface
  ctx.fillRect(cx - loopPx / 2 - viaW / 2, ySurface, escPx + spanPx * 0.18 + viaW / 2, copperT);
  ctx.fillRect(cx + spanPx / 2 - spanPx * 0.18, ySurface, escPx + spanPx * 0.18 + viaW / 2, copperT);
  // Via barrels down to the plane
  ctx.fillRect(cx - loopPx / 2 - viaW / 2, ySurface, viaW, yPlane - ySurface);
  ctx.fillRect(cx + loopPx / 2 - viaW / 2, ySurface, viaW, yPlane - ySurface);
  // Capacitor body
  const bodyH = 26;
  ctx.fillStyle = '#4a4a46';
  ctx.fillRect(cx - spanPx * 0.32, ySurface - bodyH, spanPx * 0.64, bodyH);
  ctx.fillStyle = '#a9a79c';
  ctx.fillRect(cx - spanPx / 2 + spanPx * 0.06, ySurface - bodyH, spanPx * 0.14, bodyH);
  ctx.fillRect(cx + spanPx / 2 - spanPx * 0.2, ySurface - bodyH, spanPx * 0.14, bodyH);
  ctx.fillStyle = COLORS.ink2;
  ctx.textAlign = 'center';
  ctx.fillText('capacitor', cx, ySurface - bodyH - 8);

  areaLabel(ctx, cx, (ySurface + yPlane) / 2 + 12, loopLen * depth);
  drawVDim(ctx, cx - loopPx / 2 - 22, ySurface + copperT, yPlane, `depth = ${formatLen(depth)}`);
  drawHDim(ctx, cx - loopPx / 2, cx + loopPx / 2, yPlane + 24, `loop length = ${formatLen(loopLen)}`);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'right';
  ctx.fillText('side view · vertical exaggerated · rectangle-loop estimate (~±30 %)', cw - 8, 14);
}

/* Dimension-line helpers (same style as Module 1's cross-section). */

function drawVDim(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, label: string) {
  ctx.strokeStyle = COLORS.muted;
  ctx.fillStyle = COLORS.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  arrowhead(ctx, x, y0, -Math.PI / 2);
  arrowhead(ctx, x, y1, Math.PI / 2);
  ctx.textAlign = 'right';
  ctx.fillText(label, x - 6, (y0 + y1) / 2 + 4);
}

function drawHDim(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, label: string) {
  ctx.strokeStyle = COLORS.muted;
  ctx.fillStyle = COLORS.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  arrowhead(ctx, x0, y, Math.PI);
  arrowhead(ctx, x1, y, 0);
  ctx.textAlign = 'center';
  ctx.fillText(label, (x0 + x1) / 2, y + 14);
}

function arrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 6 * Math.cos(angle - 0.4), y - 6 * Math.sin(angle - 0.4));
  ctx.lineTo(x - 6 * Math.cos(angle + 0.4), y - 6 * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}
