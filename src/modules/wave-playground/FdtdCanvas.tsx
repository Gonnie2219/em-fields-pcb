import { useEffect, useRef } from 'react';
import type { FdtdSource } from '../../physics/fdtd';
import { COLORS } from '../../components/colors';
import type { FdtdGridConfig } from './fdtdTypes';
import type { FrameSubscriber } from './useFdtd';

const HEIGHT = 380;

/**
 * Diverging Ez colormap for the dark theme: negative → blue, zero recedes to
 * the surface color (dark = zero, per the app's plot conventions), positive →
 * red. 512-entry RGB lookup table, index = (t + 1)/2 · 511 for t ∈ [−1, 1].
 */
const LUT = (() => {
  const stops: [number, string][] = [
    [-1, '#cde2fb'],
    [-0.55, '#3987e5'],
    [0, '#1a1a19'],
    [0.55, '#e66767'],
    [1, '#ffd9c9'],
  ];
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  };
  const lut = new Uint8Array(512 * 3);
  for (let k = 0; k < 512; k++) {
    const t = (k / 511) * 2 - 1;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1]![0]) s++;
    const [t0, c0] = stops[s]!;
    const [t1, c1] = stops[s + 1]!;
    const f = (t - t0) / (t1 - t0);
    const a = rgb(c0);
    const b = rgb(c1);
    for (let c = 0; c < 3; c++) lut[k * 3 + c] = Math.round(a[c]! + (b[c]! - a[c]!) * f);
  }
  return lut;
})();

const COPPER = [0xc9, 0x85, 0x00];

interface Props {
  grid: FdtdGridConfig;
  sources: FdtdSource[];
  /** Extra brightness on top of the slow auto-normalized reference. */
  gain: number;
  /** sign(v)·√|v| compression so weak reflections stay visible. */
  sqrtComp: boolean;
  subscribe: (cb: FrameSubscriber) => () => void;
}

/**
 * Live Ez heatmap: the worker's frames land in an nx × ny ImageData on an
 * offscreen canvas, scaled up to the visible canvas with image smoothing off
 * (crisp cells). PEC cells render copper; source and probe markers overlay.
 * Normalization: a slowly decaying running max of |Ez| (so ring-down stays
 * visible) times the user gain.
 */
export function FdtdCanvas({ grid, sources, gain, sqrtComp, subscribe }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastEz = useRef<Float32Array | null>(null);
  const refScale = useRef(1e-9);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { nx, ny, dx, pec, probes } = grid;
    if (!lastEz.current || lastEz.current.length !== nx * ny) {
      lastEz.current = new Float32Array(nx * ny);
      refScale.current = 1e-9;
    }
    const off = document.createElement('canvas');
    off.width = nx;
    off.height = ny;
    const octx = off.getContext('2d');
    if (!octx) return;
    const img = octx.createImageData(nx, ny);

    const draw = () => {
      const ez = lastEz.current!;
      let maxAbs = 0;
      for (let k = 0; k < ez.length; k++) {
        const a = Math.abs(ez[k]!);
        if (a > maxAbs) maxAbs = a;
      }
      refScale.current = Math.max(maxAbs, refScale.current * 0.995, 1e-9);
      const scaleV = gain / refScale.current;

      const data = img.data;
      for (let j = 0; j < ny; j++) {
        const rowImg = (ny - 1 - j) * nx;
        const rowEz = j * nx;
        for (let i = 0; i < nx; i++) {
          const k = rowEz + i;
          const p = (rowImg + i) * 4;
          if (pec[k]) {
            data[p] = COPPER[0]!;
            data[p + 1] = COPPER[1]!;
            data[p + 2] = COPPER[2]!;
          } else {
            let v = ez[k]! * scaleV;
            if (v > 1) v = 1;
            else if (v < -1) v = -1;
            if (sqrtComp) v = Math.sign(v) * Math.sqrt(Math.abs(v));
            const li = Math.min(511, Math.max(0, Math.round((v + 1) * 255.5)));
            data[p] = LUT[li * 3]!;
            data[p + 1] = LUT[li * 3 + 1]!;
            data[p + 2] = LUT[li * 3 + 2]!;
          }
          data[p + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);

      const cssW = canvas.clientWidth;
      if (cssW === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.round(cssW * dpr);
      const ph = Math.round(HEIGHT * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.height = `${HEIGHT}px`;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.surface;
      ctx.fillRect(0, 0, cssW, HEIGHT);

      const s = Math.min((cssW - 16) / nx, (HEIGHT - 30) / ny);
      const w = nx * s;
      const h = ny * s;
      const x0 = (cssW - w) / 2;
      const y0 = (HEIGHT - 30 - h) / 2 + 4;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, x0, y0, w, h);
      ctx.strokeStyle = COLORS.baseline;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, h + 1);

      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const px = (i: number) => x0 + (i + 0.5) * s;
      const py = (j: number) => y0 + (ny - 1 - j + 0.5) * s;
      for (const src of sources) {
        ctx.strokeStyle = COLORS.series3;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px(src.i), py(src.j), 5, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = COLORS.series3;
        ctx.fillText('source', px(src.i), py(src.j) - 9);
      }
      for (const pr of probes) {
        ctx.strokeStyle = COLORS.series2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px(pr.i) - 4, py(pr.j));
        ctx.lineTo(px(pr.i) + 4, py(pr.j));
        ctx.moveTo(px(pr.i), py(pr.j) - 4);
        ctx.lineTo(px(pr.i), py(pr.j) + 4);
        ctx.stroke();
        ctx.fillStyle = COLORS.series2;
        ctx.fillText('probe', px(pr.i), py(pr.j) + 16);
      }

      // 10 mm scale bar
      const bar = (10e-3 / dx) * s;
      const bx = x0 + w;
      const by = HEIGHT - 8;
      ctx.strokeStyle = COLORS.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - bar, by);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'right';
      ctx.fillText('10 mm', bx - bar - 6, by + 3.5);
    };

    draw();
    const unsub = subscribe((ez) => {
      lastEz.current!.set(ez);
      draw();
    });
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      unsub();
      ro.disconnect();
    };
  }, [grid, sources, gain, sqrtComp, subscribe]);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} style={{ height: HEIGHT }} />
    </div>
  );
}
