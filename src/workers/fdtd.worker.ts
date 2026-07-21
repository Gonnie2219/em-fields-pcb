/**
 * Web Worker running the 2D FDTD stepper (src/physics/fdtd.ts) off the main
 * thread. The UI drives it with 'frame' requests carrying a transferable
 * ArrayBuffer; the worker steps the sim, copies Ez into the buffer, and
 * transfers it back together with any new probe samples — two buffers
 * ping-pong between the threads so nothing allocates per frame.
 */
import { createSim, resetSim, setSources, step, type FdtdState } from '../physics/fdtd';
import type { FdtdFrameResponse, FdtdWorkerRequest } from '../modules/wave-playground/fdtdTypes';

let sim: FdtdState | null = null;
/** Probe samples already forwarded to the main thread. */
let probeSent = 0;

self.onmessage = (e: MessageEvent<FdtdWorkerRequest>) => {
  const req = e.data;

  if (req.type === 'init') {
    const { grid, sources } = req;
    sim = createSim({
      nx: grid.nx,
      ny: grid.ny,
      dx: grid.dx,
      boundary: grid.boundary,
      epsR: grid.epsR,
      pec: grid.pec,
      probes: grid.probes,
      probeCapacity: 65536,
      sources,
    });
    probeSent = 0;
    return;
  }

  if (req.type === 'source') {
    if (sim) setSources(sim, req.sources);
    return;
  }

  if (req.type === 'reset') {
    if (sim) resetSim(sim);
    probeSent = 0;
    return;
  }

  // 'frame'
  if (!sim) {
    const res: FdtdFrameResponse = {
      type: 'frame',
      buffer: req.buffer,
      nx: 0,
      ny: 0,
      stepCount: 0,
      time: 0,
      dt: 0,
      stepMs: 0,
      probes: [],
      probesFull: false,
    };
    postMessage(res, { transfer: [req.buffer] });
    return;
  }

  const t0 = performance.now();
  if (req.steps > 0) step(sim, req.steps);
  const stepMs = performance.now() - t0;

  let buffer = req.buffer;
  if (buffer.byteLength !== sim.ez.byteLength) buffer = new ArrayBuffer(sim.ez.byteLength);
  new Float32Array(buffer).set(sim.ez);

  const probes = sim.probeSeries.map((s) => s.slice(probeSent, sim!.probeCount));
  probeSent = sim.probeCount;

  const res: FdtdFrameResponse = {
    type: 'frame',
    buffer,
    nx: sim.nx,
    ny: sim.ny,
    stepCount: sim.n,
    time: sim.n * sim.dt,
    dt: sim.dt,
    stepMs,
    probes,
    probesFull: sim.probeCount >= sim.probeCapacity,
  };
  postMessage(res, { transfer: [buffer] });
};
