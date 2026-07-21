import { useCallback } from 'react';
import type { Spectrum } from '../../physics/fdtd';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';

const HEIGHT = 190;
const F_MAX = 2.5e9;

interface Props {
  /** Probe spectrum (null while the record is still too short). */
  spec: Spectrum | null;
  /** Interpolated dominant peak [Hz], if found. */
  peak: number | null;
  /** Analytic resonance marks. */
  marks: { f: number; label: string }[];
}

/**
 * Probe |FFT| vs frequency with dashed marks at the analytic cavity modes and
 * the measured peak labeled. Purely presentational — the module computes the
 * spectrum (physics helpers) at the stats cadence, not per animation frame.
 */
export function SpectrumPlot({ spec, peak, marks }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, w, h);
      const L = 8;
      const R = w - 8;
      const T = 14;
      const B = h - 22;
      const px = (f: number) => L + ((R - L) * f) / F_MAX;

      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let g = 0; g <= 2.5; g += 0.5) {
        const x = px(g * 1e9);
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x, B);
        ctx.stroke();
        ctx.fillText(`${g.toFixed(1)}`, x, h - 8);
      }
      ctx.textAlign = 'right';
      ctx.fillText('GHz', R, h - 8);

      if (!spec) {
        ctx.textAlign = 'center';
        ctx.fillText('accumulating probe record…', w / 2, (T + B) / 2);
        return;
      }

      let maxM = 0;
      for (let k = 1; k < spec.freqs.length; k++) {
        if (spec.freqs[k]! > F_MAX) break;
        if (spec.mags[k]! > maxM) maxM = spec.mags[k]!;
      }
      if (maxM === 0) maxM = 1;

      for (const m of marks) {
        if (m.f > F_MAX) continue;
        const x = px(m.f);
        ctx.strokeStyle = COLORS.muted;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, T);
        ctx.lineTo(x, B);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.ink2;
        ctx.textAlign = 'center';
        ctx.fillText(m.label, x, T - 3);
      }

      ctx.strokeStyle = COLORS.series1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let k = 1; k < spec.freqs.length; k++) {
        const f = spec.freqs[k]!;
        if (f > F_MAX) break;
        const y = B - (B - T - 14) * (spec.mags[k]! / maxM);
        if (started) ctx.lineTo(px(f), y);
        else {
          ctx.moveTo(px(f), y);
          started = true;
        }
      }
      ctx.stroke();

      if (peak !== null) {
        const x = px(peak);
        ctx.fillStyle = COLORS.series1;
        ctx.textAlign = 'center';
        ctx.fillText(`peak ${(peak / 1e6).toFixed(0)} MHz`, Math.min(Math.max(x, 40), w - 40), B + 12);
      }
    },
    [spec, peak, marks],
  );

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
