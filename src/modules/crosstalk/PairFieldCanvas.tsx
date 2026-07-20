import { useCallback, useMemo } from 'react';
import { cellField } from '../../physics/electrostatic';
import type { CoupledPairGeometry } from '../../physics/traceGeometry';
import { COLORS, rampColor } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';
import { contourSegments } from '../trace-fields/contours';
import type { PairResponse } from '../trace-fields/solverTypes';

export type Excitation = 'aggressor' | 'even' | 'odd';

interface Props {
  g: CoupledPairGeometry;
  res: PairResponse | null;
  excitation: Excitation;
  showHeatmap: boolean;
  showContours: boolean;
  showArrows: boolean;
}

const HEIGHT = 340;
/** Symmetric levels so odd-mode (φ < 0) contours render too. */
const CONTOUR_LEVELS = [
  -0.9, -0.75, -0.6, -0.45, -0.3, -0.15, -0.05, 0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9,
];

/**
 * Coupled-pair cross-section with the same overlay renderers as Module 2's
 * FieldCanvas (|E| heatmap, equipotentials, arrows), for the selected
 * excitation field. The left trace is the aggressor.
 */
export function PairFieldCanvas({ g, res, excitation, showHeatmap, showContours, showArrows }: Props) {
  const phi = res
    ? excitation === 'aggressor'
      ? res.phiAggressor
      : excitation === 'even'
        ? res.phiEven
        : res.phiOdd
    : null;

  const field = useMemo(
    () => (res && phi ? cellField({ nx: res.nx, ny: res.ny, dx: res.dx, dy: res.dy }, phi) : null),
    [res, phi],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      if (!res || !field || !phi) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('solving…', cw / 2, HEIGHT / 2);
        return;
      }
      const { nx, ny, dx, dy, x0 } = res;
      const sA = res.sActual;
      const ncx = nx - 1;
      const mx = Math.max(g.w, g.h);
      const vwHalf = Math.min(sA / 2 + g.w + 2.2 * mx, -x0);
      const yMax =
        g.kind === 'microstrip' ? Math.min(g.h + g.t + 2.2 * mx, (ny - 1) * dy) : (ny - 1) * dy;
      const s = Math.min((cw - 48) / (2 * vwHalf), (HEIGHT - 48) / yMax);
      const px = (x: number) => cw / 2 + x * s;
      const py = (y: number) => HEIGHT - 34 - y * s;
      ctx.font = '11px system-ui, sans-serif';

      // Dielectric region
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      const dielTop = g.kind === 'microstrip' ? g.h : yMax;
      ctx.fillRect(px(-vwHalf), py(dielTop), 2 * vwHalf * s, dielTop * s);

      const ia = Math.max(0, Math.floor((-vwHalf - x0) / dx));
      const ib = Math.min(ncx - 1, Math.ceil((vwHalf - x0) / dx));
      const jb = Math.min(ny - 2, Math.ceil(yMax / dy));
      const { ex, ey } = field;

      const mags: number[] = [];
      for (let j = 0; j <= jb; j += 2) {
        for (let i = ia; i <= ib; i += 2) {
          const ci = j * ncx + i;
          mags.push(Math.hypot(ex[ci]!, ey[ci]!));
        }
      }
      mags.sort((a, b) => a - b);
      const eRef = mags[Math.floor(mags.length * 0.98)] || 1;

      if (showHeatmap) {
        const iw = ib - ia + 1;
        const ih = jb + 1;
        const off = document.createElement('canvas');
        off.width = iw;
        off.height = ih;
        const octx = off.getContext('2d')!;
        const img = octx.createImageData(iw, ih);
        for (let j = 0; j <= jb; j++) {
          const row = (jb - j) * iw;
          for (let i = ia; i <= ib; i++) {
            const ci = j * ncx + i;
            const t = Math.min(1, Math.hypot(ex[ci]!, ey[ci]!) / eRef) ** 0.5;
            const rgb = rampColor(t).match(/\d+/g)!.map(Number);
            const k = (row + i - ia) * 4;
            img.data[k] = rgb[0]!;
            img.data[k + 1] = rgb[1]!;
            img.data[k + 2] = rgb[2]!;
            img.data[k + 3] = t < 0.03 ? 0 : Math.round(255 * (0.2 + 0.8 * t) * 0.85);
          }
        }
        octx.putImageData(img, 0, 0);
        const xa = x0 + ia * dx;
        ctx.drawImage(off, px(xa), py((jb + 1) * dy), iw * dx * s, (jb + 1) * dy * s);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(px(-vwHalf), py(yMax), 2 * vwHalf * s, yMax * s);
      ctx.clip();

      if (showContours) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const level of CONTOUR_LEVELS) {
          const segs = contourSegments(nx, ny, phi, level);
          for (let k = 0; k < segs.length; k += 4) {
            ctx.moveTo(px(x0 + segs[k]! * dx), py(segs[k + 1]! * dy));
            ctx.lineTo(px(x0 + segs[k + 2]! * dx), py(segs[k + 3]! * dy));
          }
        }
        ctx.stroke();
      }

      if (showArrows) {
        const kx = Math.max(1, Math.round((ib - ia + 1) / 26));
        const ky = Math.max(1, Math.round((jb + 1) / 15));
        ctx.strokeStyle = 'rgba(195,194,183,0.75)';
        ctx.fillStyle = 'rgba(195,194,183,0.75)';
        ctx.lineWidth = 1;
        for (let j = Math.floor(ky / 2); j <= jb; j += ky) {
          for (let i = ia + Math.floor(kx / 2); i <= ib; i += kx) {
            const ci = j * ncx + i;
            const m = Math.hypot(ex[ci]!, ey[ci]!);
            if (m < 0.05 * eRef) continue;
            const len = 4 + 10 * Math.min(1, m / eRef);
            const ux = (ex[ci]! / m) * len;
            const uy = (-ey[ci]! / m) * len;
            const cx = px(x0 + (i + 0.5) * dx);
            const cy = py((j + 0.5) * dy);
            ctx.beginPath();
            ctx.moveTo(cx - ux / 2, cy - uy / 2);
            ctx.lineTo(cx + ux / 2, cy + uy / 2);
            ctx.stroke();
            const ang = Math.atan2(uy, ux);
            ctx.beginPath();
            ctx.moveTo(cx + ux / 2, cy + uy / 2);
            ctx.lineTo(cx + ux / 2 - 4 * Math.cos(ang - 0.5), cy + uy / 2 - 4 * Math.sin(ang - 0.5));
            ctx.lineTo(cx + ux / 2 - 4 * Math.cos(ang + 0.5), cy + uy / 2 - 4 * Math.sin(ang + 0.5));
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Odd mode: mark the E-wall (φ = 0 symmetry plane between the traces)
      if (excitation === 'odd') {
        ctx.strokeStyle = COLORS.hot;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px(0), py(0));
        ctx.lineTo(px(0), py(yMax));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // Conductors on top
      ctx.fillStyle = COLORS.series3;
      ctx.fillRect(px(-vwHalf), py(0), 2 * vwHalf * s, 6);
      if (g.kind !== 'microstrip') ctx.fillRect(px(-vwHalf), py(yMax) - 6, 2 * vwHalf * s, 6);
      const tPix = Math.max(g.t * s, 3);
      ctx.fillRect(px(-sA / 2 - g.w), py(g.h + g.t), g.w * s, tPix);
      ctx.fillRect(px(sA / 2), py(g.h + g.t), g.w * s, tPix);

      // Labels
      ctx.fillStyle = COLORS.page;
      ctx.textAlign = 'left';
      ctx.fillText('0 V', px(-vwHalf) + 6, py(0) + 5.5);
      if (g.kind !== 'microstrip') ctx.fillText('0 V', px(-vwHalf) + 6, py(yMax) - 1.5);
      ctx.fillStyle = COLORS.ink2;
      ctx.textAlign = 'center';
      const yLab = py(g.h + g.t) - tPix - 6;
      ctx.fillText('aggressor +1 V', px(-sA / 2 - g.w / 2), yLab);
      const victimLabel =
        excitation === 'aggressor' ? 'victim 0 V' : excitation === 'even' ? '+1 V' : '−1 V';
      ctx.fillText(victimLabel, px(sA / 2 + g.w / 2), yLab);
      if (excitation === 'odd') {
        ctx.fillStyle = COLORS.hot;
        ctx.fillText('E-wall: virtual ground plane (φ = 0)', px(0), py(yMax) - 12);
      }
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'left';
      ctx.fillText(`εr = ${g.epsR.toFixed(1)}`, px(-vwHalf) + 6, py(dielTop / 2) + 4);
      if (g.kind === 'microstrip') {
        ctx.fillText('air (εr = 1)', px(-vwHalf) + 6, py(yMax) + 14);
      }

      // Scale bar
      const bar = [2e-3, 1e-3, 0.5e-3, 0.2e-3].find((b) => b * s <= 120) ?? 0.2e-3;
      const bx1 = cw - 20;
      const by = HEIGHT - 12;
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx1 - bar * s, by);
      ctx.lineTo(bx1, by);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(`${bar * 1e3} mm`, bx1, by - 5);
    },
    [g, res, phi, field, excitation, showHeatmap, showContours, showArrows],
  );

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
