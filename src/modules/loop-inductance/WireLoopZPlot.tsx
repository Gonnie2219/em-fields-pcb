import { useCallback, useState } from 'react';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';
import { formatHz, formatOhm } from '../pdn/pdnModel';

interface Props {
  freqs: Float64Array;
  /** |Z(f)| [Ω]. */
  zMag: Float64Array;
  /** R(f) asymptote [Ω]. */
  rOfF: Float64Array;
  /** ωL asymptote [Ω]. */
  xOfF: Float64Array;
  /** Crossover frequency [Hz]. */
  fc: number;
}

const HEIGHT = 340;
const M = { left: 62, right: 16, top: 18, bottom: 34 };

/** Log-log |Z| of the wire loop with its R(f) and ωL asymptotes dashed. */
export function WireLoopZPlot({ freqs, zMag, rOfF, xOfF, fc }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const pw = cw - M.left - M.right;
      const ph = HEIGHT - M.top - M.bottom;
      const lf0 = Math.log10(freqs[0]!);
      const lf1 = Math.log10(freqs[freqs.length - 1]!);
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of zMag) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      const ly0 = Math.floor(Math.log10(lo));
      const ly1 = Math.ceil(Math.log10(hi));
      const px = (f: number) => M.left + ((Math.log10(f) - lf0) / (lf1 - lf0)) * pw;
      const py = (z: number) => M.top + ph - ((Math.log10(z) - ly0) / (ly1 - ly0)) * ph;

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';

      // Decade grid
      ctx.lineWidth = 1;
      for (let d = Math.ceil(lf0); d <= lf1; d++) {
        const x = px(10 ** d);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(x, M.top);
        ctx.lineTo(x, M.top + ph);
        ctx.stroke();
        if (d % 2 === 0) {
          ctx.fillStyle = COLORS.muted;
          ctx.textAlign = 'center';
          ctx.fillText(formatHz(10 ** d), x, M.top + ph + 16);
        }
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
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText('frequency', M.left + pw / 2, HEIGHT - 6);
      ctx.save();
      ctx.translate(13, M.top + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('|Z| (log)', 0, 0);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(M.left, M.top, pw, ph);
      ctx.clip();

      const trace = (z: Float64Array, color: string, width: number, dash: number[]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let i = 0; i < freqs.length; i++) {
          const x = px(freqs[i]!);
          const y = py(z[i]!);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      trace(rOfF, COLORS.series3, 1.5, [5, 4]);
      trace(xOfF, COLORS.series2, 1.5, [5, 4]);
      trace(zMag, COLORS.series1, 2, []);

      // Crossover marker
      if (fc >= freqs[0]! && fc <= freqs[freqs.length - 1]!) {
        const i = Math.round(((Math.log10(fc) - lf0) / (lf1 - lf0)) * (freqs.length - 1));
        const y = py(zMag[i]!);
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px(fc), y, 4.5, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = COLORS.ink;
        ctx.textAlign = 'left';
        ctx.fillText(`f_c ≈ ${formatHz(fc)}`, px(fc) + 9, y - 8);
      }
      ctx.restore();

      // Legend
      const items: [string, string, number[]][] = [
        ['|Z|', COLORS.series1, []],
        ['R(f)', COLORS.series3, [5, 4]],
        ['ωL', COLORS.series2, [5, 4]],
      ];
      let lx = M.left + 12;
      const lyy = M.top + 14;
      for (const [label, color, dash] of items) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(lx, lyy);
        ctx.lineTo(lx + 20, lyy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(label, lx + 26, lyy + 4);
        lx += 26 + ctx.measureText(label).width + 18;
      }

      // Hover crosshair
      if (hoverX !== null && hoverX >= M.left && hoverX <= M.left + pw) {
        const lf = lf0 + ((hoverX - M.left) / pw) * (lf1 - lf0);
        const i = Math.round(((lf - lf0) / (lf1 - lf0)) * (freqs.length - 1));
        const f = freqs[i]!;
        const zv = zMag[i]!;
        ctx.strokeStyle = COLORS.baseline;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px(f), M.top);
        ctx.lineTo(px(f), M.top + ph);
        ctx.stroke();
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
    },
    [freqs, zMag, rOfF, xOfF, fc, hoverX],
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
