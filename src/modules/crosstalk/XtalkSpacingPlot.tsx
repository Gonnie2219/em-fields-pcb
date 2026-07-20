import { useCallback } from 'react';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';

export interface SweepPoint {
  sOverH: number;
  nextPct: number;
  fextPct: number;
}

export interface CurveMark {
  sOverH: number;
  label: string;
}

interface Props {
  points: SweepPoint[] | null;
  /** Current operating point (from the live solve). */
  current: SweepPoint | null;
  /** Rule-of-thumb spacings annotated ON the curve (s = 3h, 3W). */
  marks: CurveMark[];
}

const HEIGHT = 300;
const M = { left: 56, right: 16, top: 16, bottom: 36 };
const Y_MIN = 0.01; // % floor (stripline FEXT collapses below this)
const Y_MAX = 100;

/** NEXT/FEXT (% of aggressor swing) vs spacing, log-log. */
export function XtalkSpacingPlot({ points, current, marks }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';
      if (!points || points.length < 2) {
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText('sweeping spacings… (runs after you release the slider)', cw / 2, HEIGHT / 2);
        return;
      }
      const pw = cw - M.left - M.right;
      const ph = HEIGHT - M.top - M.bottom;
      const lx0 = Math.log10(points[0]!.sOverH);
      const lx1 = Math.log10(points[points.length - 1]!.sOverH);
      const ly0 = Math.log10(Y_MIN);
      const ly1 = Math.log10(Y_MAX);
      const px = (v: number) => M.left + ((Math.log10(v) - lx0) / (lx1 - lx0)) * pw;
      const py = (v: number) =>
        M.top + ph - ((Math.log10(Math.max(v, Y_MIN)) - ly0) / (ly1 - ly0)) * ph;

      // Grid
      ctx.lineWidth = 1;
      for (const v of [0.2, 0.5, 1, 2, 5, 10]) {
        if (Math.log10(v) < lx0 || Math.log10(v) > lx1) continue;
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(px(v), M.top);
        ctx.lineTo(px(v), M.top + ph);
        ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText(String(v), px(v), M.top + ph + 16);
      }
      for (let d = Math.ceil(ly0); d <= ly1; d++) {
        const v = 10 ** d;
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(M.left, py(v));
        ctx.lineTo(M.left + pw, py(v));
        ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'right';
        ctx.fillText(v >= 1 ? `${v} %` : `${v} %`, M.left - 6, py(v) + 4);
      }
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText('edge-to-edge spacing s / h', M.left + pw / 2, HEIGHT - 6);

      const trace = (get: (p: SweepPoint) => number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((p, i) => {
          const x = px(p.sOverH);
          const y = py(get(p));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = color;
        for (const p of points) {
          ctx.beginPath();
          ctx.arc(px(p.sOverH), py(get(p)), 2.5, 0, 2 * Math.PI);
          ctx.fill();
        }
      };
      trace((p) => p.nextPct, COLORS.series1);
      trace((p) => p.fextPct, COLORS.series3);

      // Rule-of-thumb marks on the NEXT curve
      const interp = (sOverH: number, get: (p: SweepPoint) => number): number | null => {
        const lx = Math.log10(sOverH);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!;
          const b = points[i]!;
          const la = Math.log10(a.sOverH);
          const lb = Math.log10(b.sOverH);
          if (lx >= la && lx <= lb) {
            const f = (lx - la) / (lb - la);
            return get(a) * (1 - f) + get(b) * f;
          }
        }
        return null;
      };
      ctx.setLineDash([4, 4]);
      for (const mark of marks) {
        const v = interp(mark.sOverH, (p) => p.nextPct);
        if (v === null) continue;
        ctx.strokeStyle = COLORS.baseline;
        ctx.beginPath();
        ctx.moveTo(px(mark.sOverH), M.top);
        ctx.lineTo(px(mark.sOverH), M.top + ph);
        ctx.stroke();
        ctx.fillStyle = COLORS.ink2;
        ctx.textAlign = 'center';
        ctx.fillText(mark.label, px(mark.sOverH), M.top + 10);
        ctx.fillStyle = COLORS.ink;
        ctx.beginPath();
        ctx.arc(px(mark.sOverH), py(v), 3.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText(`${v.toFixed(1)} %`, px(mark.sOverH), py(v) - 8);
      }
      ctx.setLineDash([]);

      // Current operating point
      if (current) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.5;
        for (const v of [current.nextPct, current.fextPct]) {
          ctx.beginPath();
          ctx.arc(px(current.sOverH), py(v), 4.5, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }

      // Legend
      const items: [string, string][] = [
        ['NEXT', COLORS.series1],
        ['|FEXT|', COLORS.series3],
      ];
      let lx = M.left + pw - 120;
      for (const [label, color] of items) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, M.top + 10);
        ctx.lineTo(lx + 18, M.top + 10);
        ctx.stroke();
        ctx.fillStyle = COLORS.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(label, lx + 24, M.top + 14);
        lx += 24 + ctx.measureText(label).width + 14;
      }
    },
    [points, current, marks],
  );

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
