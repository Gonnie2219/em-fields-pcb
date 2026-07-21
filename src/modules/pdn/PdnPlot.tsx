import { useCallback, useState } from 'react';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';
import { formatHz, formatOhm } from './pdnModel';

export interface Curve {
  label: string;
  color: string;
  width: number;
  dash?: number[];
  z: Float64Array;
}

export interface Peak {
  f: number;
  z: number;
  label: string;
}

interface Props {
  freqs: Float64Array;
  curves: Curve[];
  /** Index into curves used for the hover tooltip (the combined curve). */
  hoverIndex: number;
  /** Target-impedance line; omit to hide it (e.g. Module 8's reuse). */
  target?: number;
  peaks: Peak[];
  /** Background frequency bands; defaults to the PDN charge-supplier bands. */
  bands?: { f0: number; f1: number; label: string }[];
}

const HEIGHT = 380;
const M = { left: 62, right: 16, top: 26, bottom: 34 };

/** Frequency bands by what supplies the charge there (pedagogical). */
const BANDS = [
  { f0: 1e3, f1: 1e5, label: 'VRM' },
  { f0: 1e5, f1: 3e6, label: 'bulk caps' },
  { f0: 3e6, f1: 3e8, label: 'MLCCs' },
  { f0: 3e8, f1: 1e9, label: 'planes + on-die' },
];

export function PdnPlot({ freqs, curves, hoverIndex, target, peaks, bands }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const pw = cw - M.left - M.right;
      const ph = HEIGHT - M.top - M.bottom;
      const lf0 = Math.log10(freqs[0]!);
      const lf1 = Math.log10(freqs[freqs.length - 1]!);

      // y-range from finite data + target, snapped to decades
      let lo = target ?? Infinity;
      let hi = target ?? 0;
      for (const c of curves) {
        for (const v of c.z) {
          if (Number.isFinite(v) && v > 0) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
      }
      if (!Number.isFinite(lo) || hi <= 0) {
        lo = 1e-2;
        hi = 1e2;
      }
      const ly0 = Math.floor(Math.log10(Math.max(lo, 1e-5)));
      const ly1 = Math.ceil(Math.log10(Math.min(hi, 1e4)));
      const px = (f: number) => M.left + ((Math.log10(f) - lf0) / (lf1 - lf0)) * pw;
      const py = (z: number) =>
        M.top + ph - ((Math.log10(z) - ly0) / (ly1 - ly0)) * ph;

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';

      // Charge-supplier bands
      (bands ?? BANDS).forEach((b, i) => {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)';
        ctx.fillRect(px(b.f0), M.top, px(b.f1) - px(b.f0), ph);
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText(b.label, (px(b.f0) + px(b.f1)) / 2, M.top - 8);
      });

      // Decade grid
      ctx.lineWidth = 1;
      for (let d = Math.ceil(lf0); d <= lf1; d++) {
        const x = px(10 ** d);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(x, M.top);
        ctx.lineTo(x, M.top + ph);
        ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText(formatHz(10 ** d), x, M.top + ph + 16);
      }
      for (let d = ly0; d <= ly1; d++) {
        const y = py(10 ** d);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(M.left, y);
        ctx.lineTo(M.left + pw, y);
        ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'right';
        ctx.fillText(formatOhm(10 ** d), M.left - 6, y + 4);
      }
      ctx.textAlign = 'center';
      ctx.fillText('frequency', M.left + pw / 2, HEIGHT - 6);
      ctx.save();
      ctx.translate(13, M.top + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('|Z| (log)', 0, 0);
      ctx.restore();

      // Clip curves to the plot area
      ctx.save();
      ctx.beginPath();
      ctx.rect(M.left, M.top, pw, ph);
      ctx.clip();

      // Target line
      if (target !== undefined) {
        ctx.strokeStyle = '#ec835a';
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(M.left, py(target));
        ctx.lineTo(M.left + pw, py(target));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ec835a';
        ctx.textAlign = 'left';
        ctx.fillText(`target ${formatOhm(target)}`, M.left + 6, py(target) - 5);
      }

      for (const c of curves) {
        ctx.strokeStyle = c.color;
        ctx.lineWidth = c.width;
        ctx.setLineDash(c.dash ?? []);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i < freqs.length; i++) {
          const v = c.z[i]!;
          if (!Number.isFinite(v) || v <= 0) {
            pen = false;
            continue;
          }
          const x = px(freqs[i]!);
          const y = py(v);
          if (pen) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          pen = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Anti-resonance callouts
      ctx.fillStyle = COLORS.hot;
      ctx.strokeStyle = COLORS.hot;
      for (const p of peaks) {
        const x = px(p.f);
        const y = py(p.z);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(p.label, x, y - 10);
      }
      ctx.restore();

      // Legend
      const legendX = M.left + pw - 190;
      let ly = M.top + 14;
      for (const c of curves) {
        ctx.strokeStyle = c.color;
        ctx.lineWidth = c.width;
        ctx.setLineDash(c.dash ?? []);
        ctx.beginPath();
        ctx.moveTo(legendX, ly);
        ctx.lineTo(legendX + 20, ly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(c.label, legendX + 26, ly + 4);
        ly += 15;
      }

      // Hover crosshair on the combined curve
      if (hoverX !== null && hoverX >= M.left && hoverX <= M.left + pw) {
        const lf = lf0 + ((hoverX - M.left) / pw) * (lf1 - lf0);
        const i = Math.round(((lf - lf0) / (lf1 - lf0)) * (freqs.length - 1));
        const f = freqs[i]!;
        const zv = curves[hoverIndex]?.z[i];
        ctx.strokeStyle = COLORS.baseline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px(f), M.top);
        ctx.lineTo(px(f), M.top + ph);
        ctx.stroke();
        if (zv !== undefined && Number.isFinite(zv)) {
          ctx.fillStyle = COLORS.ink;
          ctx.beginPath();
          ctx.arc(px(f), py(zv), 3.5, 0, 2 * Math.PI);
          ctx.fill();
          const text = `${formatHz(f)} · ${formatOhm(zv)}`;
          const tx = px(f) + 140 > M.left + pw ? px(f) - 148 : px(f) + 10;
          ctx.fillStyle = 'rgba(13,13,13,0.92)';
          ctx.strokeStyle = COLORS.baseline;
          ctx.beginPath();
          ctx.roundRect(tx, M.top + ph - 30, 138, 22, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = COLORS.ink;
          ctx.textAlign = 'left';
          ctx.fillText(text, tx + 8, M.top + ph - 15);
        }
      }
    },
    [freqs, curves, hoverIndex, target, peaks, bands, hoverX],
  );

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas
        ref={ref}
        onPointerMove={(e) => setHoverX(e.nativeEvent.offsetX)}
        onPointerLeave={() => setHoverX(null)}
      />
    </div>
  );
}
