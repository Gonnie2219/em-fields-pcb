import { useEffect, useRef, useState } from 'react';
import type { TraceGeometry } from '../../physics/traceGeometry';
import type { Quality, SolveRequest, SolveResponse } from './solverTypes';

/**
 * Manages the field-solver worker: debounces slider input, never queues more
 * than one pending request while a solve is in flight (latest wins), and
 * reports a `solving` flag for the UI indicator.
 */
export function useFieldSolver(g: TraceGeometry, quality: Quality) {
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [solving, setSolving] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);
  const busy = useRef(false);
  const queued = useRef<SolveRequest | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/fieldSolver.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<SolveResponse>) => {
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
    return () => {
      worker.terminate();
      workerRef.current = null;
      busy.current = false;
      queued.current = null;
    };
  }, []);

  useEffect(() => {
    const req: SolveRequest = { id: ++seq.current, g, quality };
    setSolving(true);
    const timer = setTimeout(() => {
      const worker = workerRef.current;
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

  return { result, solving };
}
