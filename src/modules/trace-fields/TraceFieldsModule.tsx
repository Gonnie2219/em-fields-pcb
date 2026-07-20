import { useMemo, useState } from 'react';
import { C_LIGHT } from '../../physics/constants';
import type { TraceGeometry, TraceKind } from '../../physics/traceGeometry';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import { FieldCanvas } from './FieldCanvas';
import type { Quality } from './solverTypes';
import { useFieldSolver } from './useFieldSolver';

export function TraceFieldsModule() {
  const [kind, setKind] = useState<TraceKind>('microstrip');
  const [wMm, setWMm] = useState(1.0);
  const [tMm, setTMm] = useState(0.035);
  const [hMm, setHMm] = useState(0.5);
  const [epsR, setEpsR] = useState(4.4);
  const [quality, setQuality] = useState<Quality>('balanced');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [showArrows, setShowArrows] = useState(false);

  const g = useMemo<TraceGeometry>(
    () => ({ kind, w: wMm * 1e-3, t: tMm * 1e-3, h: hMm * 1e-3, epsR }),
    [kind, wMm, tMm, hMm, epsR],
  );
  const { result: res, solving } = useFieldSolver(g, quality);

  const psPerMm = res ? 1e9 / res.vP : null;

  return (
    <>
      <div className="panel">
        <h3>
          Cross-section field solution
          <span className={`solving-dot${solving ? ' on' : ''}`}>solving…</span>
        </h3>
        <FieldCanvas
          g={g}
          res={res}
          showHeatmap={showHeatmap}
          showContours={showContours}
          showArrows={showArrows}
        />
        <p className="caption">
          {kind === 'microstrip'
            ? 'Note how the field fringes into the air above the board — only part of the energy travels in the dielectric.'
            : 'The field is fully contained between the two planes — nothing fringes out.'}
          {res &&
            ` Grid ${res.nx}×${res.ny}, ${res.iterations} SOR sweeps, ${res.solveMs.toFixed(0)} ms.`}
        </p>
      </div>

      <div className="panel">
        <h3>Controls</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div className="segmented">
            {(['microstrip', 'stripline'] as const).map((k) => (
              <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                {k}
              </button>
            ))}
          </div>
          <div className="control" style={{ minWidth: 160 }}>
            <label>
              <span>Solver quality</span>
            </label>
            <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
              <option value="draft">draft (fast)</option>
              <option value="balanced">balanced</option>
              <option value="fine">fine (slow)</option>
            </select>
          </div>
        </div>
        <div className="controls">
          <Slider
            label="Trace width w"
            value={wMm}
            min={0.1}
            max={3}
            step={0.02}
            format={(v) => `${v.toFixed(2)} mm`}
            onChange={setWMm}
          />
          <Slider
            label="Trace thickness t"
            value={tMm}
            min={0}
            max={0.1}
            step={0.005}
            format={(v) => `${(v * 1000).toFixed(0)} µm`}
            onChange={setTMm}
          />
          <Slider
            label={kind === 'microstrip' ? 'Dielectric height h' : 'Trace-to-plane clearance h'}
            value={hMm}
            min={0.1}
            max={2}
            step={0.02}
            format={(v) => `${v.toFixed(2)} mm`}
            onChange={setHMm}
          />
          <Slider
            label="Dielectric εr"
            value={epsR}
            min={1}
            max={12}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={setEpsR}
          />
        </div>
        <div className="checks">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showContours}
              onChange={(e) => setShowContours(e.target.checked)}
            />
            equipotential contours
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showArrows}
              onChange={(e) => setShowArrows(e.target.checked)}
            />
            E-field arrows
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
            />
            |E| heatmap
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Line parameters (quasi-TEM, two-solve method)</h3>
        <div className="readouts">
          <div className="readout">
            <div className="label">Characteristic impedance Z₀</div>
            <div className="value big">{res ? `${res.Z0.toFixed(1)} Ω` : '—'}</div>
          </div>
          <div className="readout">
            <div className="label">C′ / L′ per length</div>
            <div className="value" style={{ fontSize: 16 }}>
              {res ? `${(res.C * 1e12).toFixed(1)} pF/m · ${(res.L * 1e9).toFixed(0)} nH/m` : '—'}
            </div>
          </div>
          <div className="readout">
            <div className="label">ε_eff / phase velocity</div>
            <div className="value" style={{ fontSize: 16 }}>
              {res
                ? `${res.epsEff.toFixed(2)} · ${(res.vP / 1e8).toFixed(2)}×10⁸ m/s (${((res.vP / C_LIGHT) * 100).toFixed(0)}% c)`
                : '—'}
            </div>
          </div>
          <div className="readout">
            <div className="label">Propagation delay</div>
            <div className="value" style={{ fontSize: 16 }}>
              {psPerMm ? `${psPerMm.toFixed(2)} ps/mm · ${(psPerMm * 25.4).toFixed(0)} ps/in` : '—'}
            </div>
          </div>
          <div className="readout">
            <div className="label">Field energy inside the dielectric</div>
            <div className="value" style={{ fontSize: 16 }}>
              {res ? `${(res.dielEnergyFraction * 100).toFixed(0)} %` : '—'}
            </div>
            <div className="note">
              {kind === 'microstrip' ? 'the rest fringes through the air' : '100 % by construction'}
            </div>
          </div>
        </div>
      </div>

      <PhysicsPanel>
        <p>
          <strong>Model.</strong> In the quasi-TEM approximation the transverse field of a
          transmission line is electrostatic: the potential obeys Laplace&apos;s equation with a
          spatially varying permittivity,
        </p>
        <Equation display tex="\nabla\cdot\left(\varepsilon_r \nabla \phi\right) = 0" />
        <p>
          solved here by finite differences (cell-centered εr, face permittivity = mean of the
          adjacent cells; conductors are Dirichlet regions at 1 V / 0 V; open sides are
          zero-flux Neumann boundaries placed ≈ 8×max(w, h) away). The capacitance per length
          comes from the field energy:
        </p>
        <Equation display tex="W' = \tfrac{1}{2}\int \varepsilon\,|\nabla\phi|^2\, dA,\qquad C' = \frac{2W'}{V^2}" />
        <p>
          <strong>The two-solve trick.</strong> Solving the identical geometry twice — once with
          the real dielectric (→ C′) and once with everything set to εr = 1 (→ C′₀) — gives all
          the line parameters, because a (non-magnetic) dielectric has no effect whatsoever on
          the inductance:
        </p>
        <Equation display tex="L' = \frac{1}{c^2 C'_0},\qquad Z_0 = \frac{1}{c\sqrt{C' C'_0}},\qquad \varepsilon_\mathrm{eff} = \frac{C'}{C'_0},\qquad v_p = \frac{c}{\sqrt{\varepsilon_\mathrm{eff}}}" />
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>
            Quasi-TEM: pure transverse fields, valid well below the frequencies where microstrip
            dispersion and surface waves matter.
          </li>
          <li>Lossless: perfect conductors and dielectric; no skin effect, no tan δ.</li>
          <li>No dispersion: ε_eff and Z₀ are the static (low-frequency) values.</li>
          <li>2D cross-section: uniform line, per-unit-length quantities.</li>
          <li>
            Finite grid and box: results carry ~1–3 % discretization error (validated against
            Hammerstad–Jensen within 5 %); the open boundary sits ≈ 8×max(w, h) away.
          </li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
