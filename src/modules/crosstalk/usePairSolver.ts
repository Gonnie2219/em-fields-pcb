import { useEffect, useRef, useState } from 'react';
import type { CoupledPairGeometry } from '../../physics/traceGeometry';
import type {
  PairRequest,
  PairResponse,
  PairSweepRequest,
  PairSweepResponse,
  Quality,
} from '../trace-fields/solverTypes';

/**
 * Sweep spacings for the coupling-vs-s curve: 9 log-spaced points spanning
 * enough range to place the s = 3h and 3W-rule (s = 2w) annotations on the
 * curve.
 */
export function sweepSpacings(g: CoupledPairGeometry): number[] {
  const sMin = Math.max(0.05e-3, 0.15 * g.h);
  const sMax = Math.max(8 * g.h, 2.5 * g.w);
  const n = 9;
  return Array.from({ length: n }, (_, i) => sMin * (sMax / sMin) ** (i / (n - 1)));
}

const newSolverWorker = () =>
  new Worker(new URL('../../workers/fieldSolver.worker.ts', import.meta.url), { type: 'module' });

/**
 * Coupled-pair solver hook: an interactive worker for the 'pair' task
 * (debounced, latest-wins — same protocol as useFieldSolver) plus a second
 * worker for spacing sweeps, which only fire after the geometry settles
 * (drag-release, 500 ms) and are cached by geometry-minus-s signature so a
 * sweep is never recomputed while dragging s itself.
 */
export function usePairSolver(g: CoupledPairGeometry, quality: Quality) {
  const [result, setResult] = useState<PairResponse | null>(null);
  const [sweep, setSweep] = useState<PairSweepResponse | null>(null);
  const [solving, setSolving] = useState(true);

  const pairWorker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const busy = useRef(false);
  const queued = useRef<PairRequest | null>(null);

  const sweepWorker = useRef<Worker | null>(null);
  const sweepCache = useRef(new Map<string, PairSweepResponse>());
  const sweepSig = useRef('');
  const sweepInFlight = useRef(new Set<string>());

  useEffect(() => {
    const worker = newSolverWorker();
    pairWorker.current = worker;
    worker.onmessage = (e: MessageEvent<PairResponse>) => {
      busy.current = false;
      if (queued.current) {
        const next = queued.current;
        queued.current = null;
        busy.current = true;
        worker.postMessage(next);
      } else {
        setSolving(false);
      }
      if (e.data.id === seq.current) setResult(e.data);
    };
    const sw = newSolverWorker();
    sweepWorker.current = sw;
    sw.onmessage = (e: MessageEvent<PairSweepResponse>) => {
      const d = e.data;
      if (d.tag) {
        sweepInFlight.current.delete(d.tag);
        sweepCache.current.set(d.tag, d);
        if (d.tag === sweepSig.current) setSweep(d);
      }
    };
    return () => {
      worker.terminate();
      sw.terminate();
      pairWorker.current = null;
      sweepWorker.current = null;
      busy.current = false;
      queued.current = null;
      sweepInFlight.current.clear();
    };
  }, []);

  useEffect(() => {
    const req: PairRequest = { task: 'pair', id: ++seq.current, g, quality };
    setSolving(true);
    const timer = setTimeout(() => {
      const worker = pairWorker.current;
      if (!worker) return;
      if (busy.current) {
        queued.current = req; // drop any older pending request
      } else {
        busy.current = true;
        worker.postMessage(req);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [g, quality]);

  const sig = [g.kind, g.w, g.t, g.h, g.epsR].join(':');
  useEffect(() => {
    sweepSig.current = sig;
    const cached = sweepCache.current.get(sig);
    if (cached) {
      setSweep(cached);
      return;
    }
    setSweep(null);
    const timer = setTimeout(() => {
      const worker = sweepWorker.current;
      if (!worker || sweepInFlight.current.has(sig)) return;
      sweepInFlight.current.add(sig);
      // Sweep responses are matched by tag, never by id — do NOT bump the
      // shared seq counter here, or a pair solve slower than this 500 ms
      // timer gets its reply dropped (id ≠ seq) and the module hangs on
      // "solving…" (seen with cold production-build solves).
      const req: PairSweepRequest = {
        task: 'pairSweep',
        id: 0,
        g,
        spacings: sweepSpacings(g),
        tag: sig,
      };
      worker.postMessage(req);
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return { result, sweep, solving };
}
