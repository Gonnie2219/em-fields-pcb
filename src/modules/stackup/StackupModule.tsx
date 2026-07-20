import { useMemo, useState } from 'react';
import { interplaneCapacitancePerArea } from '../../physics/planePair';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import { FieldCanvas } from '../trace-fields/FieldCanvas';
import type { Quality } from '../trace-fields/solverTypes';
import { StackupCanvas } from './StackupCanvas';
import {
  PRESETS,
  ROLE_NAMES,
  TARGET_TOTAL_MM,
  analyzeSignalLayers,
  planePairs,
  scorecard,
  totalThickness,
  type LayerRole,
  type Stackup,
} from './stackupModel';
import { invertKey, solveKey, useStackupSolves } from './useStackupSolves';

const QUALITY: Quality = 'balanced';
const TARGET_Z0 = 50;

const MODEL_NAMES = {
  microstrip: 'microstrip',
  'offset-stripline': 'offset stripline',
  embedded: 'embedded (≈ microstrip)',
  none: '—',
} as const;

export function StackupModule() {
  const [presetId, setPresetId] = useState('4l-good');
  const [stackup, setStackup] = useState<Stackup>(PRESETS[1]!.stackup);
  const [wMm, setWMm] = useState(0.3);
  const [epsR, setEpsR] = useState(4.4);
  const [selected, setSelected] = useState<number | null>(null);

  const signals = useMemo(() => analyzeSignalLayers(stackup, wMm, epsR), [stackup, wMm, epsR]);
  const geoms = useMemo(() => {
    const seen = new Set<string>();
    return signals.flatMap((s) => {
      if (!s.g) return [];
      const key = solveKey(s.g, QUALITY);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, g: s.g }];
    });
  }, [signals]);
  const { solves, inverts, solving } = useStackupSolves(geoms, QUALITY, TARGET_Z0);

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setStackup(structuredClone(preset.stackup));
    setSelected(null);
  };
  const setRole = (i: number, role: LayerRole) => {
    setStackup((s) => ({ ...s, copper: s.copper.map((r, k) => (k === i ? role : r)) }));
    setPresetId('custom');
    setSelected(null);
  };
  const setDielAt = (i: number, mm: number) => {
    setStackup((s) => ({ ...s, diel: s.diel.map((d, k) => (k === i ? mm : d)) }));
    setPresetId('custom');
  };

  const total = totalThickness(stackup);
  const thicknessOff = Math.abs(total - TARGET_TOTAL_MM) > 0.1;
  const pairs = planePairs(stackup);
  const scores = useMemo(() => scorecard(stackup, epsR), [stackup, epsR]);
  const selectedSignal = signals.find((s) => s.index === selected) ?? null;
  const selectedRes = selectedSignal?.g ? solves.get(solveKey(selectedSignal.g, QUALITY)) : undefined;

  return (
    <>
      <div className="panel">
        <h3>
          Stackup cross-section
          <span className={`solving-dot${solving ? ' on' : ''}`}>solving…</span>
        </h3>
        <div className="segmented" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={presetId === p.id ? 'active' : ''}
              onClick={() => applyPreset(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button className={presetId === 'custom' ? 'active' : ''} disabled>
            custom
          </button>
        </div>
        <StackupCanvas
          stackup={stackup}
          wMm={wMm}
          signals={signals}
          selected={selected}
          onSelect={setSelected}
        />
        <p className="caption">
          Total thickness {total.toFixed(2)} mm{' '}
          {thicknessOff ? (
            <span style={{ color: '#ec835a' }}>
              — deviates from the {TARGET_TOTAL_MM.toFixed(1)} mm standard; check fab
              capabilities and connector/enclosure fit.
            </span>
          ) : (
            `(standard ${TARGET_TOTAL_MM.toFixed(1)} mm ✓)`
          )}
        </p>
      </div>

      <div className="panel">
        <h3>Controls</h3>
        <div className="controls">
          <Slider
            label="Trace width w (all signal layers)"
            value={wMm}
            min={0.1}
            max={1.5}
            step={0.01}
            format={(v) => `${v.toFixed(2)} mm`}
            onChange={setWMm}
          />
          <Slider
            label="Dielectric εr (all layers)"
            value={epsR}
            min={1}
            max={12}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={setEpsR}
          />
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
          {stackup.copper.map((role, i) => (
            <div key={i} className="control" style={{ minWidth: 0 }}>
              <label>
                <span>L{i + 1}</span>
              </label>
              <div className="segmented">
                {(['S', 'G', 'P'] as const).map((r) => (
                  <button
                    key={r}
                    className={role === r ? 'active' : ''}
                    style={{ padding: '3px 9px' }}
                    onClick={() => setRole(i, r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="controls" style={{ marginTop: 12 }}>
          {stackup.diel.map((d, i) => (
            <Slider
              key={i}
              label={`Dielectric L${i + 1}–L${i + 2}`}
              value={d}
              min={0.05}
              max={1.5}
              step={0.01}
              format={(v) => `${v.toFixed(2)} mm`}
              onChange={(v) => setDielAt(i, v)}
            />
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Signal layers (solver-backed, w = {wMm.toFixed(2)} mm)</h3>
        <table className="stack-table">
          <thead>
            <tr>
              <th>layer</th>
              <th>model</th>
              <th>reference / h</th>
              <th>Z₀</th>
              <th>w for {TARGET_Z0} Ω</th>
              <th>delay</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => {
              const res = s.g ? solves.get(solveKey(s.g, QUALITY)) : undefined;
              const inv = s.g ? inverts.get(invertKey(s.g, QUALITY, TARGET_Z0)) : undefined;
              return (
                <tr key={s.index}>
                  <td>L{s.index + 1}</td>
                  <td>{MODEL_NAMES[s.model]}</td>
                  <td>
                    {s.model === 'none' ? (
                      <span style={{ color: '#ec835a' }}>no reference plane!</span>
                    ) : s.model === 'offset-stripline' ? (
                      `↑${ROLE_NAMES[s.refAbove!.role]} ${s.refAbove!.dist.toFixed(2)} / ↓${ROLE_NAMES[s.refBelow!.role]} ${s.refBelow!.dist.toFixed(2)} mm`
                    ) : (
                      `${ROLE_NAMES[s.nearestRef!.role]} L${s.nearestRef!.index + 1} · h = ${s.nearestRef!.dist.toFixed(2)} mm`
                    )}
                  </td>
                  <td>{res ? `${res.Z0.toFixed(1)} Ω` : s.g ? '…' : '—'}</td>
                  <td>{inv ? `${(inv.w * 1e3).toFixed(2)} mm` : s.g ? '…' : '—'}</td>
                  <td>{res ? `${(1e9 / res.vP).toFixed(2)} ps/mm` : s.g ? '…' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedSignal && selectedSignal.g && (
        <div className="panel">
          <h3>
            L{selectedSignal.index + 1} field view — {MODEL_NAMES[selectedSignal.model]}
          </h3>
          <FieldCanvas
            g={selectedSignal.g}
            res={selectedRes ?? null}
            showHeatmap
            showContours
            showArrows={false}
          />
          {selectedSignal.model === 'embedded' && (
            <p className="caption">
              Approximation: this buried layer has only one reference plane and is modeled as a
              surface microstrip (air above) — the real dielectric above it raises ε_eff somewhat.
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <h3>Plane-pair interplane capacitance</h3>
        {pairs.length === 0 ? (
          <p style={{ margin: 0 }}>
            No adjacent power–ground plane pair in this stackup — the board gets zero
            distributed plane capacitance, so all HF decoupling must come from discrete
            capacitors (Module 4).
          </p>
        ) : (
          <div className="readouts">
            {pairs.map((p) => {
              const cA = interplaneCapacitancePerArea(epsR, p.dMm * 1e-3);
              return (
                <div className="readout" key={`${p.top}-${p.bottom}`}>
                  <div className="label">
                    L{p.top + 1} ({ROLE_NAMES[stackup.copper[p.top]!]}) ↔ L{p.bottom + 1} (
                    {ROLE_NAMES[stackup.copper[p.bottom]!]}) · d = {p.dMm.toFixed(2)} mm
                  </div>
                  <div className="value" style={{ fontSize: 18 }}>
                    {(cA * 1e12 * 1e-4).toFixed(1)} pF/cm²
                  </div>
                  <div className="note">
                    {(cA * 0.01 * 1e9).toFixed(2)} nF over a 100 × 100 mm board —{' '}
                    {p.dMm <= 0.3
                      ? 'meaningful “free” HF capacitance with almost no inductance'
                      : 'too little to matter; discrete capacitors must carry the load'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Scorecard</h3>
        <ul className="score-list">
          {scores.map((s, i) => (
            <li key={i} className={`score-item ${s.status}`}>
              <span className="score-badge">
                {s.status === 'good' ? '✓' : s.status === 'warn' ? '!' : '✕'}
              </span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <PhysicsPanel>
        <p>
          <strong>Why h controls everything.</strong> The trace-to-plane spacing h sets the
          return-current corridor (≈ ±3h, Module 1), the characteristic impedance (Z₀ grows
          roughly logarithmically as the plane moves away), and the crosstalk reach (coupled
          fields extend sideways a distance ~h). Halving h halves the loop area, tightens the
          corridor, and roughly halves crosstalk — the single most powerful stackup knob.
        </p>
        <p>
          <strong>Signal layer models.</strong> Outer layers are microstrip; inner layers with
          planes on both sides are offset stripline, solved with the Module-2 field solver:
        </p>
        <Equation
          display
          tex="\nabla\cdot(\varepsilon_r\nabla\phi)=0,\qquad Z_0 = \frac{1}{c\sqrt{C'C'_0}},\qquad v_p = \frac{c}{\sqrt{C'/C'_0}}"
        />
        <p>
          <strong>Why plane pairs matter.</strong> An adjacent P–G pair is a parallel-plate
          capacitor distributed under the whole circuit,{' '}
          <Equation tex="C'' = \varepsilon_0\varepsilon_r/d" />, with essentially zero series
          inductance — it supplies charge at frequencies where any discrete capacitor has long
          since gone inductive.
        </p>
        <p>
          <strong>The 4-layer tradeoff.</strong> Signal integrity wants the outer prepregs thin
          (small h for L1/L4) — but on a fixed-thickness board, thin outer dielectrics force a
          thick core, pushing P and G far apart and destroying the interplane capacitance.
          Impedance or decoupling: a 4-layer board can&apos;t have both. That missing
          mid-frequency charge is exactly what discrete decoupling capacitors must supply —
          Module 4.
        </p>
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>All Module-2 solver assumptions (quasi-TEM, lossless, no dispersion, 2D).</li>
          <li>One εr for every dielectric layer (real boards mix prepreg/core εr slightly).</li>
          <li>
            Buried signals with a single reference are modeled as surface microstrip (air
            above) — flagged “embedded (≈ microstrip)”; ε_eff is somewhat underestimated.
          </li>
          <li>
            Distances through intermediate copper ignore that an intervening signal layer
            partially screens the field.
          </li>
          <li>Isolated trace per layer (no neighbors); corridor width from the HF ±3h rule.</li>
          <li>Interplane C″ neglects edge fringing (fine for planes ≫ d apart).</li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
