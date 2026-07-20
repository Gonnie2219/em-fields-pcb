import { useCallback, useState } from 'react';
import {
  returnCurrentDensity,
  returnCurrentDensityDC,
  returnCurrentDensityHF,
  returnCurrentDensityWithSlot,
} from '../../physics/returnCurrent';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';

interface Props {
  hMm: number;
  WMm: number;
  f: number;
  slot: boolean;
  slotWidthMm: number;
}

const HEIGHT = 280;
const M = { left: 58, right: 14, top: 14, bottom: 34 };

/**
 * XY plot of return current density J(x) across the plane, for I = 1 A:
 * blended curve (solid) plus the HF and DC limiting cases (dashed).
 */
export function CurrentDensityPlot({ hMm, WMm, f, slot, slotWidthMm }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const pw = cw - M.left - M.right;
      const ph = HEIGHT - M.top - M.bottom;
      const p = { h: hMm * 1e-3, W: WMm * 1e-3, f, I: 1 };
      const slotW = slotWidthMm * 1e-3;
      const halfWmm = WMm / 2;

      const xToPx = (xMm: number) => M.left + ((xMm + halfWmm) / WMm) * pw;
      const pxToX = (px: number) => ((px - M.left) / pw) * WMm - halfWmm;

      const blend = (xM: number) =>
        slot ? returnCurrentDensityWithSlot(xM, p, slotW) : returnCurrentDensity(xM, p);
      const series = [
        {
          name: slot ? 'with slot (schematic)' : 'blended J(x)',
          color: COLORS.series1,
          dash: [] as number[],
          width: 2,
          fn: blend,
        },
        {
          name: 'HF limit',
          color: COLORS.series2,
          dash: [6, 4],
          width: 1.5,
          fn: (xM: number) => returnCurrentDensityHF(xM, p.h),
        },
        {
          name: 'DC limit',
          color: COLORS.series3,
          dash: [2, 4],
          width: 1.5,
          fn: (xM: number) => returnCurrentDensityDC(xM, p.W),
        },
      ];

      let jMax = 0;
      for (let px = 0; px <= pw; px++) {
        const xM = pxToX(M.left + px) * 1e-3;
        for (const s of series) jMax = Math.max(jMax, s.fn(xM));
      }
      const yTop = jMax * 1.08;
      const yToPx = (j: number) => M.top + ph - (j / yTop) * ph;

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);

      // ±3h window shading
      const bandHalf = Math.min(3 * hMm, halfWmm);
      ctx.fillStyle = 'rgba(57,135,229,0.10)';
      ctx.fillRect(xToPx(-bandHalf), M.top, xToPx(bandHalf) - xToPx(-bandHalf), ph);

      // Grid + ticks
      ctx.font = '11px system-ui, sans-serif';
      ctx.lineWidth = 1;
      const yTicks = 4;
      for (let i = 0; i <= yTicks; i++) {
        const j = (yTop * i) / yTicks;
        const y = yToPx(j);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(M.left, y);
        ctx.lineTo(M.left + pw, y);
        ctx.stroke();
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'right';
        ctx.fillText(formatJ(j), M.left - 6, y + 4);
      }
      const xStep = niceStep(WMm / 6);
      for (let xMm = 0; xMm <= halfWmm + 1e-9; xMm += xStep) {
        for (const xs of xMm === 0 ? [0] : [xMm, -xMm]) {
          const x = xToPx(xs);
          ctx.strokeStyle = COLORS.grid;
          ctx.beginPath();
          ctx.moveTo(x, M.top);
          ctx.lineTo(x, M.top + ph);
          ctx.stroke();
          ctx.fillStyle = COLORS.muted;
          ctx.textAlign = 'center';
          ctx.fillText(String(xs), x, M.top + ph + 16);
        }
      }
      // Baseline
      ctx.strokeStyle = COLORS.baseline;
      ctx.beginPath();
      ctx.moveTo(M.left, M.top + ph);
      ctx.lineTo(M.left + pw, M.top + ph);
      ctx.stroke();

      // Axis titles
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText('x — distance from trace centerline (mm)', M.left + pw / 2, HEIGHT - 6);
      ctx.save();
      ctx.translate(12, M.top + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('J (A/m, per 1 A)', 0, 0);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillText('±3h', xToPx(bandHalf) + 4, M.top + 12);

      // Curves (reference limits first, blended on top)
      for (const s of [...series].reverse()) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.setLineDash(s.dash);
        ctx.beginPath();
        let pen = false;
        for (let px = 0; px <= pw; px++) {
          const j = s.fn(pxToX(M.left + px) * 1e-3);
          const y = yToPx(j);
          if (pen) ctx.lineTo(M.left + px, y);
          else ctx.moveTo(M.left + px, y);
          pen = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Legend (top-right)
      const legendX = M.left + pw - 168;
      series.forEach((s, i) => {
        const y = M.top + 12 + i * 16;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.setLineDash(s.dash);
        ctx.beginPath();
        ctx.moveTo(legendX, y);
        ctx.lineTo(legendX + 20, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.ink2;
        ctx.textAlign = 'left';
        ctx.fillText(s.name, legendX + 26, y + 4);
      });

      // Hover crosshair + tooltip
      if (hoverX !== null && hoverX >= M.left && hoverX <= M.left + pw) {
        const xMm = pxToX(hoverX);
        ctx.strokeStyle = COLORS.baseline;
        ctx.beginPath();
        ctx.moveTo(hoverX, M.top);
        ctx.lineTo(hoverX, M.top + ph);
        ctx.stroke();
        const jHover = blend(xMm * 1e-3);
        ctx.fillStyle = COLORS.series1;
        ctx.beginPath();
        ctx.arc(hoverX, yToPx(jHover), 3.5, 0, 2 * Math.PI);
        ctx.fill();
        const lines = [`x = ${xMm.toFixed(2)} mm`, `J = ${formatJ(jHover)} A/m`];
        const tw = 130;
        const tx = hoverX + tw + 12 > M.left + pw ? hoverX - tw - 12 : hoverX + 12;
        const ty = M.top + 8;
        ctx.fillStyle = 'rgba(13,13,13,0.92)';
        ctx.strokeStyle = COLORS.baseline;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, 40, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = COLORS.ink;
        lines.forEach((t, i) => ctx.fillText(t, tx + 10, ty + 16 + i * 15));
      }
    },
    [hMm, WMm, f, slot, slotWidthMm, hoverX],
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

/** Compact tick formatting for J values [A/m]. */
function formatJ(j: number): string {
  if (j >= 1000) return `${(j / 1000).toFixed(1)}k`;
  if (j >= 100) return j.toFixed(0);
  if (j >= 1) return j.toFixed(1);
  return j.toFixed(2);
}

/** Round a raw step to 1/2/5×10ⁿ for readable axis ticks. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * pow;
}
