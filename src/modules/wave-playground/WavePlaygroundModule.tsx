import { useMemo, useState } from 'react';
import { C_LIGHT } from '../../physics/constants';
import { cavityModeFrequency, hannSpectrum, peakFrequency } from '../../physics/fdtd';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import { FdtdCanvas } from './FdtdCanvas';
import { SpectrumPlot } from './SpectrumPlot';
import { useFdtd } from './useFdtd';
import {
  BOARD,
  buildGrid,
  buildSources,
  SCENARIOS,
  type ScenarioId,
} from './scenarios';

const CAVITY_MODES: { m: number; n: number }[] = [
  { m: 1, n: 0 },
  { m: 0, n: 1 },
  { m: 1, n: 1 },
  { m: 2, n: 0 },
];

const STEPS_OPTIONS = [2, 4, 8, 16, 32];

export function WavePlaygroundModule() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('cavity');
  const [sourceKind, setSourceKind] = useState<'gaussian' | 'cw'>('gaussian');
  const [cwGHz, setCwGHz] = useState(0.72);
  const [epsR, setEpsR] = useState(4.3);
  const [pitchMm, setPitchMm] = useState(6);
  const [slotMm, setSlotMm] = useState(4);
  const [gapMm, setGapMm] = useState(2);
  const [gain, setGain] = useState(1);
  const [sqrtComp, setSqrtComp] = useState(true);
  const [stepsPerFrame, setStepsPerFrame] = useState(8);
  const [running, setRunning] = useState(true);

  const def = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;

  const selectScenario = (id: ScenarioId) => {
    const d = SCENARIOS.find((s) => s.id === id)!;
    setScenarioId(id);
    setSourceKind(d.defaultSourceKind);
    setCwGHz(d.defaultCwGHz);
    setRunning(true);
  };

  const grid = useMemo(
    () =>
      buildGrid(scenarioId, {
        epsR,
        pitchM: pitchMm * 1e-3,
        slotM: slotMm * 1e-3,
        gapM: gapMm * 1e-3,
      }),
    [scenarioId, epsR, pitchMm, slotMm, gapMm],
  );
  const sources = useMemo(
    () => buildSources(scenarioId, sourceKind, cwGHz * 1e9),
    [scenarioId, sourceKind, cwGHz],
  );

  const { subscribe, stats, getProbeTrace, stepOnce, reset } = useFdtd(
    grid,
    sources,
    stepsPerFrame,
    running,
  );

  // Cavity: one FFT per stats tick feeds both the plot and the readout.
  const cavitySpec = useMemo(() => {
    if (scenarioId !== 'cavity' || stats.probeCount < 1024 || stats.dt <= 0) return null;
    const trace = getProbeTrace(0);
    const samples = trace.slice(Math.max(0, trace.length - 8192));
    return {
      spec: hannSpectrum(samples, stats.dt),
      peak: peakFrequency(samples, stats.dt, 0.3e9, 2.5e9),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, stats.probeCount, stats.dt]);

  // Shielded box: leakage level at the outside probe (recent window).
  const leak = useMemo(() => {
    if (scenarioId !== 'box') return null;
    const trace = getProbeTrace(0);
    if (trace.length < 64) return null;
    let m = 0;
    for (let k = Math.max(0, trace.length - 512); k < trace.length; k++) {
      m = Math.max(m, Math.abs(trace[k]!));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, stats.probeCount, gapMm]);

  const a = BOARD.nx * BOARD.dx;
  const b = BOARD.ny * BOARD.dx;
  const marks = CAVITY_MODES.map(({ m, n }) => ({
    f: cavityModeFrequency(a, b, m, n, epsR),
    label: `f${m}${n}`,
  }));
  const lambda = C_LIGHT / (Math.sqrt(epsR) * cwGHz * 1e9);

  const boundaryNote =
    grid.boundary === 'pmc'
      ? 'Board edges: PMC magnetic walls — the open edge of a plane pair; waves reflect back in.'
      : 'Board edges: first-order Mur absorbing boundary — an “infinite board”; waves leave and do not return.';

  return (
    <>
      <div className="panel">
        <h3>2D FDTD sandbox — Ez between the planes, top-down view</h3>
        <div className="segmented" style={{ marginBottom: 10 }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={scenarioId === s.id ? 'active' : ''}
              onClick={() => selectScenario(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <FdtdCanvas grid={grid} sources={sources} gain={gain} sqrtComp={sqrtComp} subscribe={subscribe} />
        <p className="caption">
          {def.watchFor} {boundaryNote}
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <div className="segmented">
            <button onClick={() => setRunning(!running)}>{running ? '⏸ pause' : '▶ play'}</button>
            <button onClick={stepOnce} disabled={running}>
              step
            </button>
            <button
              onClick={() => {
                reset();
              }}
            >
              ↺ reset
            </button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
            t = {(stats.time * 1e9).toFixed(2)} ns · {stats.stepCount} steps · {stats.stepMs.toFixed(1)}{' '}
            ms/frame · grid {grid.nx}×{grid.ny} @ {(grid.dx * 1e3).toFixed(1)} mm
          </span>
        </div>
      </div>

      <div className="panel">
        <h3>Controls</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div className="segmented">
            {(['gaussian', 'cw'] as const).map((k) => (
              <button key={k} className={sourceKind === k ? 'active' : ''} onClick={() => setSourceKind(k)}>
                {k === 'gaussian' ? 'pulse (via noise)' : 'CW sine'}
              </button>
            ))}
          </div>
          <div className="control" style={{ minWidth: 150 }}>
            <label>
              <span>Steps per frame</span>
            </label>
            <select value={stepsPerFrame} onChange={(e) => setStepsPerFrame(Number(e.target.value))}>
              {STEPS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 8 ? '(default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={sqrtComp} onChange={(e) => setSqrtComp(e.target.checked)} />
            √-compress (weak reflections visible)
          </label>
        </div>
        <div className="controls">
          {sourceKind === 'cw' && (
            <Slider
              label="CW frequency"
              value={cwGHz}
              min={0.3}
              max={3}
              log
              format={(v) => `${v.toFixed(2)} GHz`}
              onChange={setCwGHz}
            />
          )}
          <Slider
            label="Substrate εr"
            value={epsR}
            min={1}
            max={10}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={setEpsR}
          />
          <Slider
            label="Display gain"
            value={gain}
            min={0.1}
            max={30}
            log
            format={(v) => `${v.toFixed(1)}×`}
            onChange={setGain}
          />
          {def.param && (
            <Slider
              label={def.param.label}
              value={def.param.key === 'pitch' ? pitchMm : def.param.key === 'slot' ? slotMm : gapMm}
              min={def.param.minMm}
              max={def.param.maxMm}
              step={0.5}
              format={(v) => `${v.toFixed(1)} mm`}
              onChange={def.param.key === 'pitch' ? setPitchMm : def.param.key === 'slot' ? setSlotMm : setGapMm}
            />
          )}
        </div>
        {(scenarioId === 'fence' || scenarioId === 'slot' || scenarioId === 'box') &&
          sourceKind === 'cw' && (
            <p className="caption">
              λ = c/(√εr·f) = <strong>{(lambda * 1e3).toFixed(1)} mm</strong> at {cwGHz.toFixed(2)} GHz
              in εr = {epsR.toFixed(1)}
              {scenarioId === 'fence' && (
                <>
                  {' '}
                  → λ/pitch = <strong>{(lambda / (pitchMm * 1e-3)).toFixed(1)}</strong>. The stitching
                  folk rule wants pitch ≤ λ/20 ({((lambda / 20) * 1e3).toFixed(1)} mm here); the fence
                  goes leaky well before pitch reaches λ/2.
                </>
              )}
            </p>
          )}
        {scenarioId === 'fence' && sourceKind !== 'cw' && (
          <p className="caption">Switch the source to CW to sweep frequency against the fence pitch.</p>
        )}
      </div>

      {scenarioId === 'cavity' && (
        <div className="panel">
          <h3>Probe spectrum vs analytic cavity modes</h3>
          <SpectrumPlot spec={cavitySpec?.spec ?? null} peak={cavitySpec?.peak ?? null} marks={marks} />
          <div className="readouts" style={{ marginTop: 10 }}>
            {CAVITY_MODES.map(({ m, n }) => (
              <div className="readout" key={`${m}${n}`}>
                <div className="label">
                  f<sub>{m}{n}</sub> analytic
                </div>
                <div className="value" style={{ fontSize: 16 }}>
                  {(cavityModeFrequency(a, b, m, n, epsR) / 1e6).toFixed(0)} MHz
                </div>
              </div>
            ))}
            <div className="readout">
              <div className="label">Probe-FFT dominant peak</div>
              <div className="value" style={{ fontSize: 16 }}>
                {cavitySpec?.peak ? `${(cavitySpec.peak / 1e6).toFixed(0)} MHz` : '—'}
              </div>
              <div className="note">Hann + zero-pad + parabolic interpolation; sharpens as the record grows</div>
            </div>
          </div>
          <p className="caption">
            f<sub>mn</sub> = c/(2√εr)·√((m/a)² + (n/b)²) for the {(a * 1e3).toFixed(0)}×
            {(b * 1e3).toFixed(0)} mm plane pair. This is why bare power planes make good radiators:
            every via transient re-excites these modes.
          </p>
        </div>
      )}

      {scenarioId === 'box' && (
        <div className="panel">
          <h3>Leakage at the outside probe</h3>
          <div className="readouts">
            <div className="readout">
              <div className="label">max |Ez| outside (last 512 samples)</div>
              <div className="value big">{leak === null ? '—' : leak.toExponential(2)}</div>
              <div className="note">
                seam gap {gapMm.toFixed(1)} mm ={' '}
                {sourceKind === 'cw' ? `λ/${(lambda / Math.max(gapMm * 1e-3, 1e-6)).toFixed(0)}` : 'pulse drive'} —
                set the gap to 0 and watch it die
              </div>
            </div>
          </div>
        </div>
      )}

      <PhysicsPanel>
        <p>
          <strong>Model.</strong> 2D FDTD in TMz polarization on a Yee grid (Yee 1966; Taflove &amp;
          Hagness, <em>Computational Electrodynamics</em>, 3rd ed.). The three surviving field
          components are Ez, Hx, Hy:
        </p>
        <Equation
          display
          tex="\frac{\partial H_x}{\partial t} = -\frac{1}{\mu_0}\frac{\partial E_z}{\partial y},\qquad \frac{\partial H_y}{\partial t} = \frac{1}{\mu_0}\frac{\partial E_z}{\partial x},\qquad \frac{\partial E_z}{\partial t} = \frac{1}{\varepsilon_0\varepsilon_r}\!\left(\frac{\partial H_y}{\partial x} - \frac{\partial H_x}{\partial y}\right)"
        />
        <p>
          <strong>Yee leapfrog update</strong> — E and H live on staggered grids, half a step apart in
          space and time; each is advanced from the curl of the other:
        </p>
        <Equation
          display
          tex="E_z^{\,n+1}[i,j] = E_z^{\,n}[i,j] + \frac{\Delta t}{\varepsilon_0\varepsilon_r\Delta x}\Bigl(H_y^{\,n+\frac12}[i{+}\tfrac12,j] - H_y^{\,n+\frac12}[i{-}\tfrac12,j] - H_x^{\,n+\frac12}[i,j{+}\tfrac12] + H_x^{\,n+\frac12}[i,j{-}\tfrac12]\Bigr)"
        />
        <p>
          <strong>Stability (Courant condition).</strong> The time step is locked to the grid:
        </p>
        <Equation display tex="\Delta t = S\,\frac{\Delta x}{c\sqrt{2}},\qquad S \le 1\ \ (S = 0.99\text{ here})" />
        <p>
          <strong>Boundaries.</strong> PEC (metal wall, Ez = 0), PMC (magnetic wall — the standard
          model for the open edge of a thin plane pair), or the first-order Mur ABC (Mur 1981), the
          one-way wave equation discretized on the boundary:
        </p>
        <Equation
          display
          tex="E_z^{\,n+1}[0,j] = E_z^{\,n}[1,j] + \frac{c'\Delta t - \Delta x}{c'\Delta t + \Delta x}\Bigl(E_z^{\,n+1}[1,j] - E_z^{\,n}[0,j]\Bigr),\qquad c' = \frac{c}{\sqrt{\varepsilon_r}}"
        />
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>
            2D TMz: fields are z-invariant — the top-down view of a thin plane pair. Real boards are
            finite in z; vertical structure (layer changes, via barrels in 3D) is out of scope.
          </li>
          <li>Conductors are PEC (lossless, perfectly shielding); no skin-effect or dielectric loss.</li>
          <li>
            The open board edge is approximated as a magnetic wall (PMC) — good when the plane
            separation is far smaller than a wavelength; real edges also radiate a little.
          </li>
          <li>
            First-order Mur absorbs cleanly only near normal incidence (validated &lt; 5% there);
            oblique waves reflect a few percent — visible with the √-compression on.
          </li>
          <li>Soft (additive) sources: they inject energy but never scatter returning waves.</li>
          <li>
            Grid dispersion is negligible at this resolution (≥ 90 cells/λ at 3 GHz in εr = 4.3);
            validated: pulse speed within 2% of c and c/2, cavity f₁₀ within 3% of analytic.
          </li>
          <li>
            Via posts are single 0.5 mm PEC cells — pitch, not barrel geometry, is the physics being
            shown.
          </li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
