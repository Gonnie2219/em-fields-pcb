import { useCallback } from 'react';
import { returnCurrentDensity, returnCurrentDensityWithSlot } from '../../physics/returnCurrent';
import { COLORS, rampColor } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';

interface Props {
  /** All geometry in mm at this layer; converted to SI for physics calls. */
  hMm: number;
  wMm: number;
  WMm: number;
  f: number;
  slot: boolean;
  slotWidthMm: number;
}

const HEIGHT = 250;
const V_PX_PER_MM = 45; // fixed vertical scale (exaggeration noted on canvas)

/**
 * Cross-section of the microstrip: trace at height h over a plane of width W,
 * with the return current density painted on the plane as a heatmap strip.
 */
export function CrossSectionCanvas({ hMm, wMm, WMm, f, slot, slotWidthMm }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const padX = 34;
      const planeW = cw - 2 * padX;
      const pxPerMm = planeW / WMm;
      const cx = cw / 2;
      const yPlane = 186; // top of the plane
      const planeThick = 12;
      const yTraceBottom = yPlane - hMm * V_PX_PER_MM;
      const traceThick = 8;
      const traceWpx = Math.max(3, wMm * pxPerMm);

      const p = { h: hMm * 1e-3, W: WMm * 1e-3, f, I: 1 };
      const slotW = slotWidthMm * 1e-3;
      const J = (xM: number) =>
        slot ? returnCurrentDensityWithSlot(xM, p, slotW) : returnCurrentDensity(xM, p);

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);

      // Dielectric substrate (thickness h) between plane and trace
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(padX, yTraceBottom, planeW, yPlane - yTraceBottom);

      // Plane with J(x) heatmap strip
      let jMax = 0;
      for (let px = 0; px <= planeW; px++) {
        jMax = Math.max(jMax, J((px / planeW - 0.5) * p.W));
      }
      for (let px = 0; px <= planeW; px++) {
        const xM = (px / planeW - 0.5) * p.W;
        if (slot && Math.abs(xM) < slotW / 2) continue; // slot: bare gap
        ctx.fillStyle = rampColor(jMax > 0 ? J(xM) / jMax : 0);
        ctx.fillRect(padX + px, yPlane, 1, planeThick);
      }

      // Trace (copper)
      ctx.fillStyle = COLORS.series3;
      ctx.fillRect(cx - traceWpx / 2, yTraceBottom - traceThick, traceWpx, traceThick);

      // Current direction symbols: signal into the page, return out of the page
      ctx.strokeStyle = COLORS.ink2;
      ctx.fillStyle = COLORS.ink2;
      ctx.font = '11px system-ui, sans-serif';
      ctx.lineWidth = 1;
      const symY = yTraceBottom - traceThick / 2;
      const symX = cx + traceWpx / 2 + 12;
      ctx.beginPath();
      ctx.arc(symX, symY, 5, 0, 2 * Math.PI);
      ctx.moveTo(symX - 3.5, symY - 3.5);
      ctx.lineTo(symX + 3.5, symY + 3.5);
      ctx.moveTo(symX + 3.5, symY - 3.5);
      ctx.lineTo(symX - 3.5, symY + 3.5);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText('I (into page)', symX + 10, symY + 4);
      const retX = padX + planeW * 0.82;
      const retY = yPlane + planeThick / 2;
      ctx.beginPath();
      ctx.arc(retX, retY, 5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(retX, retY, 1.4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillText('return (out of page)', retX + 10, retY + 4);

      // Dimension: h (trace height above plane)
      const dimX = cx - traceWpx / 2 - 16;
      drawVDim(ctx, dimX, yTraceBottom, yPlane, `h = ${hMm.toFixed(2)} mm`);
      // Dimension: w (trace width)
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`w = ${wMm.toFixed(2)} mm`, cx, yTraceBottom - traceThick - 8);
      // Dimension: W (plane width)
      drawHDim(ctx, padX, padX + planeW, yPlane + planeThick + 16, `W = ${WMm.toFixed(1)} mm`);

      // Slot annotation: ballooned loop (schematic)
      if (slot) {
        const slotHalfPx = (slotWidthMm / 2) * pxPerMm;
        ctx.strokeStyle = COLORS.hot;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(
          cx,
          (symY + yPlane + planeThick) / 2,
          slotHalfPx + 24,
          (yPlane + planeThick - symY) / 2 + 12,
          0,
          0,
          2 * Math.PI,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.hot;
        ctx.textAlign = 'center';
        ctx.fillText(
          'return current detours around the slot — loop area balloons (schematic)',
          cx,
          HEIGHT - 8,
        );
      }

      // Scale note
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      const exag = V_PX_PER_MM / pxPerMm;
      ctx.fillText(
        `vertical scale ×${exag.toFixed(1)} of horizontal`,
        cw - 8,
        14,
      );
    },
    [hMm, wMm, WMm, f, slot, slotWidthMm],
  );

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}

/** Vertical dimension line with arrowheads and a right-aligned label. */
function drawVDim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y0: number,
  y1: number,
  label: string,
) {
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

/** Horizontal dimension line with arrowheads and a centered label. */
function drawHDim(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  label: string,
) {
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
