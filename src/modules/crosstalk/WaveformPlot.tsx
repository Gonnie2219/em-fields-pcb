import { useCallback } from 'react';
import { fextWaveform, nextWaveform } from '../../physics/crosstalk';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';

interface Props {
  cmCs: number;
  lmLs: number;
  /** Propagation delay of the coupled section [s]. */
  td: number;
  /** Aggressor rise time [s]. */
  tr: number;
}

const HEIGHT = 280;
const M = { left: 46, right: 16, top: 16, bottom: 34 };
const MAGS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * Closed-form NEXT/FEXT pulse sketches (weak-coupling model — no FDTD).
 * Victim traces are magnified by a common factor so they stay visible next
 * to the unit aggressor edge; the factor is printed in the legend.
 */
export function WaveformPlot({ cmCs, lmLs, td, tr }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const pw = cw - M.left - M.right;
      const ph = HEIGHT - M.top - M.bottom;
      const T = Math.max(2 * td + 3 * tr, td + 4 * tr);
      const N = 500;
      const nextV = new Float64Array(N + 1);
      const fextV = new Float64Array(N + 1);
      let maxAmp = 0;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * T;
        nextV[i] = nextWaveform(t, cmCs, lmLs, td, tr);
        fextV[i] = fextWaveform(t, cmCs, lmLs, td, tr);
        maxAmp = Math.max(maxAmp, Math.abs(nextV[i]!), Math.abs(fextV[i]!));
      }
      const mag = maxAmp > 0 ? (MAGS.filter((m) => m * maxAmp <= 0.95).pop() ?? 1) : 1;

      const px = (t: number) => M.left + (t / T) * pw;
      const py = (v: number) => M.top + ph / 2 - (v * ph) / 2.2;

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';

      // Time grid (ns or ps)
      const ns = T >= 2e-9;
      const unit = ns ? 1e-9 : 1e-12;
      const stepChoices = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      const step = (stepChoices.find((c) => (c * unit) / T >= 0.12) ?? 5000) * unit;
      ctx.lineWidth = 1;
      for (let t = 0; t <= T; t += step) {
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(px(t), M.top);
        ctx.lineTo(px(t), M.top + ph);
        ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'center';
        ctx.fillText(`${(t / unit).toFixed(0)}`, px(t), M.top + ph + 16);
      }
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`time (${ns ? 'ns' : 'ps'})`, M.left + pw / 2, HEIGHT - 6);
      // Zero line
      ctx.strokeStyle = COLORS.baseline;
      ctx.beginPath();
      ctx.moveTo(M.left, py(0));
      ctx.lineTo(M.left + pw, py(0));
      ctx.stroke();

      // Aggressor edge (unit ramp, launched at the near end)
      ctx.strokeStyle = COLORS.muted;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(0), py(0));
      ctx.lineTo(px(Math.min(tr, T)), py(1));
      ctx.lineTo(px(T), py(1));
      ctx.stroke();
      ctx.setLineDash([]);

      const traceCurve = (v: Float64Array, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const x = px((i / N) * T);
          const y = py(v[i]! * mag);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      traceCurve(nextV, COLORS.series1);
      traceCurve(fextV, COLORS.series3);

      // 2·TD duration bracket under the NEXT pulse
      if (2 * td < T * 0.95) {
        ctx.strokeStyle = COLORS.series1;
        ctx.lineWidth = 1;
        const yb = M.top + ph - 8;
        ctx.beginPath();
        ctx.moveTo(px(0), yb);
        ctx.lineTo(px(2 * td), yb);
        ctx.stroke();
        ctx.fillStyle = COLORS.series1;
        ctx.textAlign = 'left';
        ctx.fillText('2·TD', px(2 * td) + 5, yb + 3);
      }

      // Legend
      ctx.textAlign = 'left';
      const legend: [string, string][] = [
        ['aggressor edge (×1)', COLORS.muted],
        [`NEXT (×${mag})`, COLORS.series1],
        [`FEXT (×${mag})`, COLORS.series3],
      ];
      let ly = M.top + 12;
      for (const [label, color] of legend) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(M.left + 10, ly);
        ctx.lineTo(M.left + 30, ly);
        ctx.stroke();
        ctx.fillStyle = COLORS.ink2;
        ctx.fillText(label, M.left + 36, ly + 4);
        ly += 15;
      }
    },
    [cmCs, lmLs, td, tr],
  );

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
