/**
 * Debounced main-thread DC plane solve (Module 8). The plan-view SOR solve
 * is light enough (~200×120 nodes, warm-started between slider positions)
 * that no worker is needed — per the module spec.
 */
import { useEffect, useRef, useState } from 'react';
import { solveDcPlane, type DcPlaneParams, type DcPlaneResult } from '../../physics/groundingSins';

const DEBOUNCE_MS = 150;

export function useDcSolve(params: DcPlaneParams | null): {
  result: DcPlaneResult | null;
  solving: boolean;
} {
  const [result, setResult] = useState<DcPlaneResult | null>(null);
  const [solving, setSolving] = useState(false);
  const warmStart = useRef<Float64Array | null>(null);

  useEffect(() => {
    if (!params) return;
    setSolving(true);
    const t = setTimeout(() => {
      const res = solveDcPlane(params, warmStart.current ?? undefined);
      warmStart.current = res.phi;
      setResult(res);
      setSolving(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // params is rebuilt by the caller's useMemo; identity tracks its inputs.
  }, [params]);

  return { result, solving };
}
