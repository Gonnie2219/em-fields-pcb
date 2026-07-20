/**
 * Marching-squares contour extraction on a node grid (visualization helper,
 * not physics). Returns flat line segments [i0, j0, i1, j1, ...] in
 * fractional grid coordinates (node units).
 */
export function contourSegments(
  nx: number,
  ny: number,
  phi: ArrayLike<number>,
  level: number,
): number[] {
  const segs: number[] = [];
  // Edge ids: 0 = bottom, 1 = right, 2 = top, 3 = left.
  const pairsByCase: Record<number, number[]> = {
    1: [3, 0],
    2: [0, 1],
    3: [3, 1],
    4: [1, 2],
    5: [3, 0, 1, 2],
    6: [0, 2],
    7: [3, 2],
    8: [2, 3],
    9: [0, 2],
    10: [0, 1, 2, 3],
    11: [0, 1],
    12: [3, 1],
    13: [1, 2],
    14: [3, 0],
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = phi[j * nx + i] as number;
      const v10 = phi[j * nx + i + 1] as number;
      const v01 = phi[(j + 1) * nx + i] as number;
      const v11 = phi[(j + 1) * nx + i + 1] as number;
      const idx =
        (v00 > level ? 1 : 0) |
        (v10 > level ? 2 : 0) |
        (v11 > level ? 4 : 0) |
        (v01 > level ? 8 : 0);
      const pairs = pairsByCase[idx];
      if (!pairs) continue;
      for (let k = 0; k < pairs.length; k += 2) {
        const [x0, y0] = edgePoint(pairs[k]!, i, j, v00, v10, v01, v11, level);
        const [x1, y1] = edgePoint(pairs[k + 1]!, i, j, v00, v10, v01, v11, level);
        segs.push(x0, y0, x1, y1);
      }
    }
  }
  return segs;
}

function edgePoint(
  edge: number,
  i: number,
  j: number,
  v00: number,
  v10: number,
  v01: number,
  v11: number,
  level: number,
): [number, number] {
  switch (edge) {
    case 0:
      return [i + (level - v00) / (v10 - v00), j];
    case 1:
      return [i + 1, j + (level - v10) / (v11 - v10)];
    case 2:
      return [i + (level - v01) / (v11 - v01), j + 1];
    default:
      return [i, j + (level - v00) / (v01 - v00)];
  }
}
