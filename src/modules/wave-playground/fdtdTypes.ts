import type { FdtdBoundary, FdtdProbe, FdtdSource } from '../../physics/fdtd';

/** Geometry + materials half of a scenario; changing it rebuilds (and resets) the sim. */
export interface FdtdGridConfig {
  nx: number;
  ny: number;
  /** Cell size [m]. */
  dx: number;
  boundary: FdtdBoundary;
  epsR: Float32Array;
  pec: Uint8Array;
  probes: FdtdProbe[];
}

export interface FdtdInitRequest {
  type: 'init';
  grid: FdtdGridConfig;
  sources: FdtdSource[];
}

/**
 * Advance `steps` steps (0 = just repaint) and return Ez in `buffer`.
 * The buffer is transferred both ways (ping-pong pool, no per-frame allocation).
 */
export interface FdtdFrameRequest {
  type: 'frame';
  buffer: ArrayBuffer;
  steps: number;
}

/** Swap sources without resetting the fields (e.g. CW frequency drag). */
export interface FdtdSourceRequest {
  type: 'source';
  sources: FdtdSource[];
}

export interface FdtdResetRequest {
  type: 'reset';
}

export type FdtdWorkerRequest =
  | FdtdInitRequest
  | FdtdFrameRequest
  | FdtdSourceRequest
  | FdtdResetRequest;

export interface FdtdFrameResponse {
  type: 'frame';
  /** Float32Array Ez, nx·ny (nx = 0 when the worker had no sim yet). */
  buffer: ArrayBuffer;
  nx: number;
  ny: number;
  stepCount: number;
  /** Simulated time [s]. */
  time: number;
  dt: number;
  /** Wall-clock ms spent stepping this frame. */
  stepMs: number;
  /** New probe samples since the previous frame, one array per probe. */
  probes: Float32Array[];
  /** True once the probe record hit capacity and recording stopped. */
  probesFull: boolean;
}
