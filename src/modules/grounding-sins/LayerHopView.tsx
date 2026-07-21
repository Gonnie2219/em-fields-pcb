import { useCallback } from 'react';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';

const HEIGHT = 230;
const PAD_L = 96;
const PAD_R = 16;

/**
 * Schematic side view of a layer hop (Module 3's drawing style, not to
 * scale): the signal drops from the top layer (referenced to P1) through a
 * via to the bottom layer (referenced to P2). The return current must get
 * from P1 to P2 somehow — the three options are drawn where they'd sit.
 */
export function LayerHopView() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, cw: number) => {
    const barX = PAD_L;
    const barW = cw - PAD_L - PAD_R;
    const viaX = barX + barW * 0.42;
    const yL1 = 34;
    const yP1 = 84;
    const yP2 = 134;
    const yL4 = 184;
    const t = 7;

    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(0, 0, cw, HEIGHT);
    ctx.font = '11px system-ui, sans-serif';

    // Dielectric slabs
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(barX, yL1 + t, barW, yP1 - yL1 - t);
    ctx.fillRect(barX, yP1 + t, barW, yP2 - yP1 - t);
    ctx.fillRect(barX, yP2 + t, barW, yL4 - yP2 - t);

    // Reference planes P1 / P2 (full-width copper)
    ctx.fillStyle = COLORS.series3;
    ctx.fillRect(barX, yP1, barW, t);
    ctx.fillRect(barX, yP2, barW, t);

    // Signal trace: top layer up to the via, bottom layer after it
    ctx.fillRect(barX, yL1, viaX - barX, t);
    ctx.fillRect(viaX, yL4, barX + barW - viaX, t);
    // Signal via through the board
    ctx.fillRect(viaX - 3, yL1, 6, yL4 + t - yL1);

    // Layer labels
    ctx.textAlign = 'right';
    const label = (y: number, l: string, name: string, color: string) => {
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(l, barX - 46, y + t / 2 + 4);
      ctx.fillStyle = color;
      ctx.fillText(name, barX - 10, y + t / 2 + 4);
    };
    label(yL1, 'L1', 'signal', COLORS.ink2);
    label(yP1, 'L2', 'ref P1', COLORS.series2);
    label(yP2, 'L3', 'ref P2', COLORS.violet);
    label(yL4, 'L4', 'signal', COLORS.ink2);

    // Signal current arrows
    ctx.strokeStyle = COLORS.ink2;
    ctx.fillStyle = COLORS.ink2;
    ctx.lineWidth = 1.5;
    const arrow = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 6 * Math.cos(a - 0.4), y1 - 6 * Math.sin(a - 0.4));
      ctx.lineTo(x1 - 6 * Math.cos(a + 0.4), y1 - 6 * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    };
    arrow(barX + 14, yL1 - 7, viaX - 16, yL1 - 7);
    arrow(viaX + 10, yL4 - 7, barX + barW - 14, yL4 - 7);
    ctx.textAlign = 'left';
    ctx.fillText('signal', barX + 14, yL1 - 13);

    // Return current on the plane faces (image current under each segment)
    ctx.strokeStyle = COLORS.series2;
    ctx.fillStyle = COLORS.series2;
    arrow(viaX - 24, yP1 - 5, barX + 22, yP1 - 5);
    ctx.strokeStyle = COLORS.violet;
    ctx.fillStyle = COLORS.violet;
    arrow(barX + barW - 22, yP2 + t + 10, viaX + 26, yP2 + t + 10);
    ctx.fillStyle = COLORS.ink2;
    ctx.textAlign = 'center';
    ctx.fillText('return must cross P1 → P2 here', viaX, HEIGHT - 10);

    // The three options between P1 and P2
    const yMid = (yP1 + t + yP2) / 2;
    // 1 — nothing: displacement current through the interplane capacitance
    ctx.strokeStyle = COLORS.series2;
    ctx.fillStyle = COLORS.series2;
    ctx.setLineDash([3, 3]);
    for (const dxo of [-14, 0, 14]) {
      arrow(viaX + dxo - 30, yP1 + t + 2, viaX + dxo - 30, yP2 - 3);
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    ctx.fillText('nothing: displacement', viaX - 52, yMid - 2);
    ctx.fillText('current through C_planes', viaX - 52, yMid + 11);

    // 2 — stitching via (same-net planes)
    const xVia2 = viaX + barW * 0.18;
    ctx.fillStyle = COLORS.series1;
    ctx.fillRect(xVia2 - 3, yP1, 6, yP2 + t - yP1);
    ctx.textAlign = 'center';
    ctx.fillText('stitching via', xVia2, yMid + 4);

    // 3 — stitch capacitor (different-net planes; drawn where its vias land)
    const xCap = viaX + barW * 0.38;
    ctx.strokeStyle = COLORS.violet;
    ctx.fillStyle = COLORS.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xCap, yP1 + t);
    ctx.lineTo(xCap, yMid - 4);
    ctx.moveTo(xCap - 7, yMid - 4);
    ctx.lineTo(xCap + 7, yMid - 4);
    ctx.moveTo(xCap - 7, yMid + 4);
    ctx.lineTo(xCap + 7, yMid + 4);
    ctx.moveTo(xCap, yMid + 4);
    ctx.lineTo(xCap, yP2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText('stitch cap', xCap, yP1 - 6);
  }, []);

  const ref = useCanvasDraw(draw, HEIGHT);
  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
