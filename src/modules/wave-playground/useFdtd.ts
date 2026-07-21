import { useCallback, useEffect, useRef, useState } from 'react';
import type { FdtdSource } from '../../physics/fdtd';
import type {
  FdtdFrameRequest,
  FdtdFrameResponse,
  FdtdGridConfig,
  FdtdInitRequest,
  FdtdSourceRequest,
  FdtdWorkerRequest,
} from './fdtdTypes';

export interface FdtdStats {
  stepCount: number;
  /** Simulated time [s]. */
  time: number;
  dt: number;
  /** Worker wall-clock ms spent stepping the last frame. */
  stepMs: number;
  /** Probe samples accumulated so far. */
  probeCount: number;
  probesFull: boolean;
}

const ZERO_STATS: FdtdStats = { stepCount: 0, time: 0, dt: 0, stepMs: 0, probeCount: 0, probesFull: false };

export type FrameSubscriber = (ez: Float32Array) => void;

/**
 * FDTD worker hook. While `running`, a rAF loop sends one 'frame' request per
 * display frame (stepsPerFrame steps each); two ArrayBuffers ping-pong with
 * the worker so streaming Ez frames never allocates. Subscribers get the raw
 * Ez view synchronously per frame (canvas draws imperatively — no React
 * render per frame); numeric `stats` publish at ~4 Hz. A `grid` change
 * re-inits (and resets) the sim; a `sources` change swaps the source without
 * touching the fields, so CW frequency sweeps don't restart the wave.
 */
export function useFdtd(
  grid: FdtdGridConfig,
  sources: FdtdSource[],
  stepsPerFrame: number,
  running: boolean,
) {
  const workerRef = useRef<Worker | null>(null);
  const poolRef = useRef<ArrayBuffer[]>([]);
  const busyRef = useRef(false);
  const subsRef = useRef(new Set<FrameSubscriber>());
  const tracesRef = useRef<number[][]>([]);
  const statsRef = useRef<FdtdStats>(ZERO_STATS);
  const lastPublish = useRef(0);
  const [stats, setStats] = useState<FdtdStats>(ZERO_STATS);
  const gridRef = useRef(grid);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const runningRef = useRef(running);
  runningRef.current = running;

  const requestFrame = useCallback((steps: number) => {
    const w = workerRef.current;
    if (!w || busyRef.current) return;
    const buffer = poolRef.current.pop();
    if (!buffer) return;
    busyRef.current = true;
    const req: FdtdFrameRequest = { type: 'frame', buffer, steps };
    w.postMessage(req, [buffer]);
  }, []);

  useEffect(() => {
    const w = new Worker(new URL('../../workers/fdtd.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<FdtdFrameResponse>) => {
      const res = e.data;
      busyRef.current = false;
      const g = gridRef.current;
      if (res.nx === g.nx && res.ny === g.ny) {
        const ez = new Float32Array(res.buffer);
        subsRef.current.forEach((cb) => cb(ez));
        for (let p = 0; p < res.probes.length; p++) {
          const arr = tracesRef.current[p];
          const chunk = res.probes[p]!;
          if (arr) for (let k = 0; k < chunk.length; k++) arr.push(chunk[k]!);
        }
        statsRef.current = {
          stepCount: res.stepCount,
          time: res.time,
          dt: res.dt,
          stepMs: res.stepMs,
          probeCount: tracesRef.current[0]?.length ?? 0,
          probesFull: res.probesFull,
        };
        const now = performance.now();
        if (!runningRef.current || now - lastPublish.current > 250) {
          lastPublish.current = now;
          setStats(statsRef.current);
        }
      }
      if (res.buffer.byteLength === g.nx * g.ny * 4 && poolRef.current.length < 2) {
        poolRef.current.push(res.buffer);
      }
    };
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    gridRef.current = grid;
    const w = workerRef.current;
    if (!w) return;
    const req: FdtdInitRequest = { type: 'init', grid, sources: sourcesRef.current };
    w.postMessage(req);
    const bytes = grid.nx * grid.ny * 4;
    poolRef.current = [new ArrayBuffer(bytes), new ArrayBuffer(bytes)];
    busyRef.current = false;
    tracesRef.current = grid.probes.map(() => []);
    statsRef.current = ZERO_STATS;
    setStats(ZERO_STATS);
    requestFrame(0);
  }, [grid, requestFrame]);

  useEffect(() => {
    const req: FdtdSourceRequest = { type: 'source', sources };
    workerRef.current?.postMessage(req);
  }, [sources]);

  useEffect(() => {
    if (!running) return;
    let raf = requestAnimationFrame(function tick() {
      requestFrame(stepsPerFrame);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [running, stepsPerFrame, requestFrame]);

  const stepOnce = useCallback(() => requestFrame(1), [requestFrame]);

  const reset = useCallback(() => {
    const req: FdtdWorkerRequest = { type: 'reset' };
    workerRef.current?.postMessage(req);
    tracesRef.current = tracesRef.current.map(() => []);
    statsRef.current = { ...ZERO_STATS, dt: statsRef.current.dt };
    setStats(statsRef.current);
    requestFrame(0);
  }, [requestFrame]);

  const subscribe = useCallback((cb: FrameSubscriber) => {
    subsRef.current.add(cb);
    return () => {
      subsRef.current.delete(cb);
    };
  }, []);

  /** Live probe record (mutated in place — pair with stats.probeCount for memo keys). */
  const getProbeTrace = useCallback((p: number): number[] => tracesRef.current[p] ?? [], []);

  return { subscribe, stats, getProbeTrace, stepOnce, reset };
}
