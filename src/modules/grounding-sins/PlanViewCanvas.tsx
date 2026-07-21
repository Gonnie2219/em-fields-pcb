import { useCallback } from 'react';
import { COLORS, rampColor } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';
import type { DcPlaneResult } from '../../physics/groundingSins';
import { BOARD, TRACE, type ObstacleRect } from './sinsModel';

export interface PlanScene {
  /** ±3h corridor half-width [mm]. */
  corridorHalf: number;
  obstacle: ObstacleRect | null;
  /** y of the point the return rounds (slot end or bridge) [mm]; null = no detour drawn. */
  detourEndY: number | null;
  /** Scenario A fix: stitching-via pair at the crossing. */
  viaPair?: boolean;
  /** Scenario B fix: copper bridge across the moat at this y [mm]. */
  bridgeY?: number | null;
  /** Scenario B fix: stitch capacitor at the crossing. */
  capAtCrossing?: boolean;
  mode: 'hf' | 'dc';
  dc?: DcPlaneResult | null;
  dcSolving?: boolean;
}

const HEIGHT = 400;
const PAD_X = 40;
const PAD_TOP = 28;
const PAD_BOTTOM = 26;

/** Bilinearly sample a cell-centered field at plan coordinates [mm]. */
function sampleJ(dc: DcPlaneResult, xMm: number, yMm: number): { jx: number; jy: number } {
  const { nx, ny, dx, dy } = dc.grid;
  const ncx = nx - 1;
  const ncy = ny - 1;
  const fx = (xMm * 1e-3) / dx - 0.5;
  const fy = (yMm * 1e-3) / dy - 0.5;
  const i = Math.max(0, Math.min(ncx - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(ncy - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const ty = Math.max(0, Math.min(1, fy - j));
  const lerp2 = (f: Float64Array) => {
    const a = f[j * ncx + i]! * (1 - tx) + f[j * ncx + i + 1]! * tx;
    const b = f[(j + 1) * ncx + i]! * (1 - tx) + f[(j + 1) * ncx + i + 1]! * tx;
    return a * (1 - ty) + b * ty;
  };
  return { jx: lerp2(dc.jx), jy: lerp2(dc.jy) };
}

/**
 * Board plan view (looking down onto the reference plane): trace route on
 * top, obstacle (slot/moat), and either the HF ±3h return corridor with its
 * detour, or the solver's DC current distribution (|J| heatmap +
 * streamlines).
 */
export function PlanViewCanvas({ scene }: { scene: PlanScene }) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const s = Math.min((cw - 2 * PAD_X) / BOARD.W, (HEIGHT - PAD_TOP - PAD_BOTTOM) / BOARD.H);
      const ox = (cw - BOARD.W * s) / 2;
      const oy = PAD_TOP;
      // board mm (y up) → canvas px (y down)
      const X = (x: number) => ox + x * s;
      const Y = (y: number) => oy + (BOARD.H - y) * s;

      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';

      // Reference plane
      ctx.fillStyle = 'rgba(201,133,0,0.14)';
      ctx.fillRect(X(0), Y(BOARD.H), BOARD.W * s, BOARD.H * s);
      ctx.strokeStyle = COLORS.baseline;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(0), Y(BOARD.H), BOARD.W * s, BOARD.H * s);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'left';
      ctx.fillText(
        `reference plane · plan view · ${BOARD.W} × ${BOARD.H} mm`,
        X(0),
        Y(BOARD.H) - 8,
      );

      const obs = scene.obstacle;
      const clampY = (y: number) => Math.max(0, Math.min(BOARD.H, y));

      if (scene.mode === 'dc' && scene.dc) {
        drawDc(ctx, scene.dc, X, Y, s);
      }

      // Obstacle (slot/moat): copper removed
      if (obs) {
        const y0 = clampY(obs.y0);
        const y1 = clampY(obs.y1);
        ctx.fillStyle = COLORS.page;
        ctx.fillRect(X(obs.x0), Y(y1), (obs.x1 - obs.x0) * s, (y1 - y0) * s);
        ctx.strokeStyle = COLORS.hot;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(X(obs.x0), Y(y1), (obs.x1 - obs.x0) * s, (y1 - y0) * s);
      }

      if (scene.mode === 'hf') {
        drawCorridor(ctx, scene, X, Y, s);
      }

      // Copper bridge (drawn over the moat)
      if (obs && scene.bridgeY != null) {
        const bh = 3;
        ctx.fillStyle = 'rgba(201,133,0,0.85)';
        ctx.fillRect(
          X(obs.x0) - 2,
          Y(scene.bridgeY + bh / 2),
          (obs.x1 - obs.x0) * s + 4,
          bh * s,
        );
        ctx.fillStyle = COLORS.series3;
        ctx.textAlign = 'left';
        ctx.fillText('bridge', X(obs.x1) + 6, Y(scene.bridgeY) + 4);
      }

      // Stitch capacitor at the crossing
      if (obs && scene.capAtCrossing) {
        const cx = (obs.x0 + obs.x1) / 2;
        ctx.fillStyle = COLORS.violet;
        ctx.fillRect(X(cx) - 5, Y(TRACE.y) - 9 - 8, 10, 8);
        ctx.textAlign = 'left';
        ctx.fillText('stitch cap', X(cx) + 9, Y(TRACE.y) - 12);
      }

      // Trace route (on the layer above the plane) + endpoint vias
      ctx.strokeStyle = COLORS.series3;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(TRACE.x0), Y(TRACE.y));
      ctx.lineTo(X(TRACE.x1), Y(TRACE.y));
      ctx.stroke();
      ctx.fillStyle = COLORS.series3;
      for (const x of [TRACE.x0, TRACE.x1]) {
        ctx.beginPath();
        ctx.arc(X(x), Y(TRACE.y), 4, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillText('signal trace (layer above)', X(TRACE.x0) - 2, Y(TRACE.y) - 10);

      // Stitching-via pair (scenario A fix)
      if (obs && scene.viaPair) {
        ctx.fillStyle = COLORS.series1;
        for (const x of [obs.x0 - 2, obs.x1 + 2]) {
          ctx.beginPath();
          ctx.arc(X(x), Y(TRACE.y), 3.5, 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.strokeStyle = COLORS.series1;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(X(obs.x0 - 2), Y(TRACE.y));
        ctx.lineTo(X(obs.x1 + 2), Y(TRACE.y));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.series1;
        ctx.fillText(
          'via pair: return hops through the plane below (2 × L_via)',
          X(obs.x1) + 10,
          Y(TRACE.y) + 16,
        );
      }

      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      ctx.fillText(
        scene.mode === 'dc'
          ? scene.dcSolving
            ? 'DC plane current — solving…'
            : 'DC: |J| heatmap + streamlines (SOR solve)'
          : 'HF: return current bundles within ±3h of the trace (Module 1)',
        cw - 10,
        HEIGHT - 8,
      );
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

function drawCorridor(
  ctx: CanvasRenderingContext2D,
  scene: PlanScene,
  X: (x: number) => number,
  Y: (y: number) => number,
  s: number,
) {
  const obs = scene.obstacle;
  const half = scene.corridorHalf;
  const bandTop = Y(TRACE.y + half);
  const bandH = 2 * half * s;
  const aqua = 'rgba(25,158,112,0.32)';
  const crossesTrace = obs !== null && obs.y0 < TRACE.y && obs.y1 > TRACE.y;
  const bridged = scene.bridgeY != null && Math.abs(scene.bridgeY - TRACE.y) < 1;

  ctx.fillStyle = aqua;
  if (!obs || !crossesTrace || bridged) {
    ctx.fillRect(X(TRACE.x0), bandTop, (TRACE.x1 - TRACE.x0) * s, bandH);
  } else {
    ctx.fillRect(X(TRACE.x0), bandTop, (obs.x0 - TRACE.x0) * s, bandH);
    ctx.fillRect(X(obs.x1), bandTop, (TRACE.x1 - obs.x1) * s, bandH);
  }
  ctx.fillStyle = COLORS.series2;
  ctx.textAlign = 'left';
  ctx.fillText('±3h return corridor', X(TRACE.x0) - 2, Y(TRACE.y - half) + 14);

  // Detour band around the obstacle end (or to the bridge)
  if (obs && crossesTrace && !bridged && !scene.viaPair && !scene.capAtCrossing
      && scene.detourEndY != null) {
    const endY = scene.detourEndY;
    const dir = endY >= TRACE.y ? 1 : -1;
    const past = Math.min(3, Math.max(1.5, half)); // how far beyond the end the band swings
    const yTurn = Math.max(0, Math.min(BOARD.H, endY + dir * past));
    const bw = Math.max(3, Math.min(bandH, 10)); // detour band width in px
    ctx.strokeStyle = 'rgba(25,158,112,0.8)';
    ctx.lineWidth = bw;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(X(obs.x0) - bw / 2, Y(TRACE.y));
    ctx.lineTo(X(obs.x0) - bw / 2, Y(yTurn));
    ctx.lineTo(X(obs.x1) + bw / 2, Y(yTurn));
    ctx.lineTo(X(obs.x1) + bw / 2, Y(TRACE.y));
    ctx.stroke();

    // Added-loop shading: the a × b rectangle the detour opens up
    const loopTop = Y(Math.max(TRACE.y, endY));
    const loopH = Math.abs(endY - TRACE.y) * s;
    ctx.fillStyle = 'rgba(230,103,103,0.20)';
    ctx.fillRect(X(obs.x0), loopTop, (obs.x1 - obs.x0) * s, loopH);
    ctx.strokeStyle = COLORS.hot;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(X(obs.x0), loopTop, (obs.x1 - obs.x0) * s, loopH);
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.hot;
    ctx.textAlign = 'left';
    ctx.fillText('added loop ≈ a × b', X(obs.x1) + 8, (loopTop + loopTop + loopH) / 2 + 4);
  }
}

function drawDc(
  ctx: CanvasRenderingContext2D,
  dc: DcPlaneResult,
  X: (x: number) => number,
  Y: (y: number) => number,
  s: number,
) {
  const { nx, ny, dx, dy } = dc.grid;
  const ncx = nx - 1;
  const ncy = ny - 1;

  // |J| per cell; normalize to a high percentile so the contact hot spots
  // don't wash out the rest of the plane.
  const mag = new Float64Array(ncx * ncy);
  for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(dc.jx[k]!, dc.jy[k]!);
  const sorted = Float64Array.from(mag).sort();
  const jScale = sorted[Math.floor(sorted.length * 0.98)]! || 1;

  const cellW = dx * 1e3 * s;
  const cellH = dy * 1e3 * s;
  for (let j = 0; j < ncy; j++) {
    const yPx = Y((j + 1) * dy * 1e3);
    for (let i = 0; i < ncx; i++) {
      const t = Math.min(1, mag[j * ncx + i]! / jScale) ** 0.6;
      ctx.fillStyle = rampColor(t);
      ctx.fillRect(X(i * dx * 1e3), yPx, cellW + 0.5, cellH + 0.5);
    }
  }

  // Streamlines: forward integration from a ring around the source
  const src = { x: TRACE.x0, y: TRACE.y };
  const snk = { x: TRACE.x1, y: TRACE.y };
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  const N_SEEDS = 18;
  for (let k = 0; k < N_SEEDS; k++) {
    const ang = (2 * Math.PI * k) / N_SEEDS;
    let x = src.x + 2.4 * Math.cos(ang);
    let y = src.y + 2.4 * Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(X(x), Y(y));
    for (let step = 0; step < 1500; step++) {
      const j1 = sampleJ(dc, x, y);
      const m1 = Math.hypot(j1.jx, j1.jy);
      if (m1 < jScale * 1e-5) break;
      const hx = x + (0.35 * j1.jx) / m1;
      const hy = y + (0.35 * j1.jy) / m1;
      const j2 = sampleJ(dc, hx, hy);
      const m2 = Math.hypot(j2.jx, j2.jy);
      if (m2 < jScale * 1e-5) break;
      x += (0.7 * j2.jx) / m2;
      y += (0.7 * j2.jy) / m2;
      if (x < 0 || x > BOARD.W || y < 0 || y > BOARD.H) break;
      ctx.lineTo(X(x), Y(y));
      if (Math.hypot(x - snk.x, y - snk.y) < 2.2) break;
    }
    ctx.stroke();
  }

  // Source / sink markers
  ctx.fillStyle = COLORS.ink;
  for (const [c, label] of [
    [src, 'I in'],
    [snk, 'I out'],
  ] as const) {
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillText(label, X(c.x), Y(c.y) + 18);
  }
}
