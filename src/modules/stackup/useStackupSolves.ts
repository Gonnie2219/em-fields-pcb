import { useEffect, useRef, useState } from 'react';
import type { TraceGeometry } from '../../physics/traceGeometry';
import type {
  Quality,
  SolveResponse,
  InvertResponse,
  WorkerRequest,
  WorkerResponse,
} from '../trace-fields/solverTypes';

export interface KeyedGeom {
  key: string;
  g: TraceGeometry;
}

/** Cache signature for a forward solve. */
export function solveKey(g: TraceGeometry, quality: Quality): string {
  return [g.kind, g.w, g.t, g.h, g.hAbove ?? '', g.epsR, quality].join(':');
}

/** Cache signature for a width synthesis (w is irrelevant). */
export function invertKey(g: TraceGeometry, quality: Quality, target: number): string {
  return ['inv', g.kind, g.t, g.h, g.hAbove ?? '', g.epsR, quality, target].join(':');
}

const CACHE_CAP = 24;

function lruSet<V>(map: Map<string, V>, key: string, value: V): Map<string, V> {
  const next = new Map(map);
  next.delete(key);
  next.set(key, value);
  while (next.size > CACHE_CAP) {
    const oldest = next.keys().next().value!;
    next.delete(oldest);
  }
  return next;
}

/**
 * Batch solver for the stackup module: one worker, results cached by geometry
 * signature. Forward solves are debounced (80 ms); width syntheses only run
 * after the geometry has settled (450 ms — i.e. drag-release, never per-frame).
 */
export function useStackupSolves(geoms: KeyedGeom[], quality: Quality, targetZ0: number) {
  const [solves, setSolves] = useState<Map<string, SolveResponse>>(new Map());
  const [inverts, setInverts] = useState<Map<string, InvertResponse>>(new Map());
  const [pending, setPending] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const idSeq = useRef(0);
  const inFlight = useRef(new Set<string>());
  const solvesRef = useRef(solves);
  const invertsRef = useRef(inverts);
  solvesRef.current = solves;
  invertsRef.current = inverts;

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/fieldSolver.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const d = e.data;
      if (d.tag) inFlight.current.delete(d.tag);
      setPending((p) => Math.max(0, p - 1));
      if (d.task === 'invert') setInverts((prev) => lruSet(prev, d.tag!, d));
      else if (!d.task || d.task === 'solve') setSolves((prev) => lruSet(prev, d.tag!, d));
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      inFlight.current.clear();
    };
  }, []);

  const post = (req: WorkerRequest) => {
    const worker = workerRef.current;
    if (!worker || !req.tag || inFlight.current.has(req.tag)) return;
    inFlight.current.add(req.tag);
    setPending((p) => p + 1);
    worker.postMessage(req);
  };

  const geomsSig = geoms.map((x) => x.key).join('|') + quality + targetZ0;

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const { key, g } of geoms) {
        if (!solvesRef.current.has(key)) post({ id: ++idSeq.current, g, quality, tag: key });
      }
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geomsSig]);

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const { g } of geoms) {
        const ikey = invertKey(g, quality, targetZ0);
        if (!invertsRef.current.has(ikey)) {
          post({ task: 'invert', id: ++idSeq.current, g, quality, targetZ0, tag: ikey });
        }
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geomsSig]);

  return { solves, inverts, solving: pending > 0 };
}
