import { useEffect, useRef } from 'react';

/**
 * DPR-aware canvas drawing hook. The canvas fills its container's width
 * (CSS `width: 100%`) at a fixed CSS-pixel height; `draw` receives a context
 * already scaled so it can work in CSS pixels. Redraws when `draw` changes
 * (memoize it with useCallback) and on container resize.
 */
export function useCanvasDraw(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  cssHeight: number,
) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const render = () => {
      const w = canvas.clientWidth;
      if (w === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.height = `${cssHeight}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      draw(ctx, w, cssHeight);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, cssHeight]);

  return ref;
}
