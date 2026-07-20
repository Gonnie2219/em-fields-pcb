import { useCallback } from 'react';
import { COLORS } from '../../components/colors';
import { useCanvasDraw } from '../../components/useCanvasDraw';
import {
  COPPER_T_MM,
  ROLE_NAMES,
  totalThickness,
  type SignalLayer,
  type Stackup,
} from './stackupModel';

interface Props {
  stackup: Stackup;
  wMm: number;
  signals: SignalLayer[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}

const HEIGHT = 330;
const PX_PER_MM_X = 26; // horizontal scale for trace/corridor widths
const PAD_L = 96;
const PAD_R = 116;

function layoutRows(s: Stackup, H: number) {
  const scaleY = (H - 58) / totalThickness(s);
  let y = 24;
  const copper: { y: number; h: number }[] = [];
  const diel: { y: number; h: number }[] = [];
  s.copper.forEach((_, i) => {
    const ch = Math.max(3, COPPER_T_MM * scaleY);
    copper.push({ y, h: ch });
    y += ch;
    if (i < s.diel.length) {
      const dh = Math.max(2, s.diel[i]! * scaleY);
      diel.push({ y, h: dh });
      y += dh;
    }
  });
  return { copper, diel };
}

const roleColor = (r: 'S' | 'G' | 'P') =>
  r === 'G' ? COLORS.series2 : r === 'P' ? COLORS.violet : COLORS.ink2;

/**
 * Board cross-section, vertical dimension to scale. Signal layers carry a
 * trace glyph; each signal's ±3h return-current corridor is painted on its
 * nearest reference plane, colored by that plane's role (GND aqua / PWR violet).
 */
export function StackupCanvas({ stackup, wMm, signals, selected, onSelect }: Props) {
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, cw: number) => {
      const { copper, diel } = layoutRows(stackup, HEIGHT);
      const cx = cw / 2;
      const barX = PAD_L;
      const barW = cw - PAD_L - PAD_R;
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cw, HEIGHT);
      ctx.font = '11px system-ui, sans-serif';

      // Dielectric slabs + thickness labels
      diel.forEach((row, i) => {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(barX, row.y, barW, row.h);
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = 'left';
        ctx.fillText(`${stackup.diel[i]!.toFixed(2)} mm`, barX + barW + 10, row.y + row.h / 2 + 4);
      });

      // Copper layers
      stackup.copper.forEach((role, i) => {
        const row = copper[i]!;
        if (role === 'S') {
          // Sparse signal layer: faint layer line + centered trace glyph
          ctx.strokeStyle = 'rgba(201,133,0,0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(barX, row.y + row.h / 2);
          ctx.lineTo(barX + barW, row.y + row.h / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          const wPix = Math.max(5, wMm * PX_PER_MM_X);
          ctx.fillStyle = COLORS.series3;
          ctx.fillRect(cx - wPix / 2, row.y, wPix, row.h);
        } else {
          ctx.fillStyle = COLORS.series3;
          ctx.fillRect(barX, row.y, barW, row.h);
        }
        // Left label
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(`L${i + 1}`, barX - 46, row.y + row.h / 2 + 4);
        ctx.fillStyle = roleColor(role);
        ctx.fillText(ROLE_NAMES[role], barX - 10, row.y + row.h / 2 + 4);
      });

      // Return-current corridors (±3h on the nearest reference plane)
      let corridorLabeled = false;
      for (const sig of signals) {
        if (!sig.nearestRef) continue;
        const planeRow = copper[sig.nearestRef.index]!;
        const half = Math.min(3 * sig.nearestRef.dist * PX_PER_MM_X, barW / 2 - 4);
        const color = sig.nearestRef.role === 'G' ? 'rgba(25,158,112,0.55)' : 'rgba(144,133,233,0.55)';
        ctx.fillStyle = color;
        ctx.fillRect(cx - half, planeRow.y, 2 * half, planeRow.h);
        if (!corridorLabeled) {
          ctx.fillStyle = COLORS.ink2;
          ctx.textAlign = 'left';
          ctx.fillText('±3h return corridor', cx + half + 8, planeRow.y + planeRow.h / 2 + 4);
          corridorLabeled = true;
        }
      }

      // Selection highlight on the chosen signal layer
      if (selected !== null && copper[selected]) {
        const row = copper[selected]!;
        ctx.strokeStyle = COLORS.series1;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX - 3, row.y - 4, barW + 6, row.h + 8);
      }

      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'left';
      ctx.fillText('click a signal layer for its field view · vertical to scale', barX, HEIGHT - 8);
    },
    [stackup, wMm, signals, selected],
  );

  const ref = useCanvasDraw(draw, HEIGHT);

  const handleClick = (offsetY: number) => {
    const { copper } = layoutRows(stackup, HEIGHT);
    for (let i = 0; i < stackup.copper.length; i++) {
      if (stackup.copper[i] !== 'S') continue;
      const row = copper[i]!;
      if (offsetY >= row.y - 6 && offsetY <= row.y + row.h + 6) {
        onSelect(selected === i ? null : i);
        return;
      }
    }
    onSelect(null);
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={ref}
        style={{ cursor: 'pointer' }}
        onClick={(e) => handleClick(e.nativeEvent.offsetY)}
      />
    </div>
  );
}
