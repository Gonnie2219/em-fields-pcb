import { useMemo, useState } from 'react';
import type { CoupledPairGeometry } from '../../physics/traceGeometry';
import {
  fextAmplitude,
  nextAmplitude,
  propagationDelay,
} from '../../physics/crosstalk';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import type { Quality } from '../trace-fields/solverTypes';
import { PairFieldCanvas, type Excitation } from './PairFieldCanvas';
import { usePairSolver } from './usePairSolver';
import { XtalkSpacingPlot, type CurveMark, type SweepPoint } from './XtalkSpacingPlot';
import { WaveformPlot } from './WaveformPlot';

const EXCITATIONS: { id: Excitation; label: string }[] = [
  { id: 'aggressor', label: 'aggressor only (1, 0)' },
  { id: 'even', label: 'even (1, 1)' },
  { id: 'odd', label: 'odd (1, −1)' },
];

const EXC_CAPTIONS: Record<Excitation, string> = {
  aggressor:
    'Field lines leaving the aggressor and landing on the victim — that IS the mutual ' +
    'capacitance Cm. Everything that terminates on the victim instead of the plane couples ' +
    'the two lines.',
  even:
    'Even mode: both traces at +1 V. No field between the traces (they are at the same ' +
    'potential); all flux dives to the plane. This mode sees Z_even.',
  odd:
    'Odd mode: +1 V and −1 V. The symmetry plane between the traces is at exactly 0 V — a ' +
    'virtual ground E-wall you could replace with copper without changing anything. This ' +
    'mode sees Z_odd.',
};

export function CrosstalkModule() {
  const [kind, setKind] = useState<'microstrip' | 'stripline'>('microstrip');
  const [wMm, setWMm] = useState(0.5);
  const [sMm, setSMm] = useState(0.5);
  const [hMm, setHMm] = useState(0.5);
  const [epsR, setEpsR] = useState(4.4);
  const [tMm, setTMm] = useState(0.035);
  const [quality, setQuality] = useState<Quality>('draft');
  const [excitation, setExcitation] = useState<Excitation>('aggressor');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [showArrows, setShowArrows] = useState(false);
  const [trPs, setTrPs] = useState(100);
  const [lenMm, setLenMm] = useState(50);

  const g = useMemo<CoupledPairGeometry>(
    () => ({ kind, w: wMm * 1e-3, t: tMm * 1e-3, h: hMm * 1e-3, s: sMm * 1e-3, epsR }),
    [kind, wMm, tMm, hMm, sMm, epsR],
  );
  const { result: res, sweep, solving } = usePairSolver(g, quality);

  const tr = trPs * 1e-12;
  const len = lenMm * 1e-3;
  const td = res ? propagationDelay(len, res.isoEpsEff) : null;

  const nextPct = res && td !== null ? nextAmplitude(res.pair.cmCs, res.pair.lmLs, td, tr) * 100 : null;
  const fextPct = res && td !== null ? fextAmplitude(res.pair.cmCs, res.pair.lmLs, td, tr) * 100 : null;

  const sweepPoints: SweepPoint[] | null = useMemo(() => {
    if (!sweep || td === null) return null;
    return sweep.sActual.map((s, i) => ({
      sOverH: s / g.h,
      nextPct: Math.abs(nextAmplitude(sweep.cmCs[i]!, sweep.lmLs[i]!, td, tr)) * 100,
      fextPct: Math.abs(fextAmplitude(sweep.cmCs[i]!, sweep.lmLs[i]!, td, tr)) * 100,
    }));
  }, [sweep, td, tr, g.h]);

  const marks: CurveMark[] = [
    { sOverH: 3, label: 's = 3h' },
    { sOverH: (2 * g.w) / g.h, label: '3W rule (s = 2w)' },
  ];

  const current: SweepPoint | null =
    res && nextPct !== null && fextPct !== null
      ? { sOverH: res.sActual / g.h, nextPct: Math.abs(nextPct), fextPct: Math.abs(fextPct) }
      : null;

  const fmt = (v: number | null | undefined, digits = 1, unit = '') =>
    v === null || v === undefined ? '—' : `${v.toFixed(digits)}${unit}`;

  return (
    <>
      <div className="panel">
        <h3>
          Coupled-pair field solution
          <span className={`solving-dot${solving ? ' on' : ''}`}>solving…</span>
        </h3>
        <div className="segmented" style={{ marginBottom: 10 }}>
          {EXCITATIONS.map((e) => (
            <button
              key={e.id}
              className={excitation === e.id ? 'active' : ''}
              onClick={() => setExcitation(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
        <PairFieldCanvas
          g={g}
          res={res}
          excitation={excitation}
          showHeatmap={showHeatmap}
          showContours={showContours}
          showArrows={showArrows}
        />
        <p className="caption">
          {EXC_CAPTIONS[excitation]}
          {res && ` Grid ${res.nx}×${res.ny}, ${res.iterations} SOR sweeps, ${res.solveMs.toFixed(0)} ms.`}
        </p>
        <div className="checks">
          <label className="toggle">
            <input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} />
            equipotential contours
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} />
            E-field arrows
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
            |E| heatmap
          </label>
        </div>
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
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            ← flip this at fixed w, s, h and watch FEXT collapse: the module&apos;s argument-settler.
          </span>
        </div>
        <div className="controls">
          <Slider label="Trace width w" value={wMm} min={0.1} max={2} step={0.02}
            format={(v) => `${v.toFixed(2)} mm`} onChange={setWMm} />
          <Slider label="Edge-to-edge spacing s" value={sMm} min={0.05} max={3} log
            format={(v) => `${v.toFixed(2)} mm`} onChange={setSMm} />
          <Slider label={kind === 'microstrip' ? 'Dielectric height h' : 'Trace-to-plane clearance h'}
            value={hMm} min={0.1} max={1} step={0.02}
            format={(v) => `${v.toFixed(2)} mm`} onChange={setHMm} />
          <Slider label="Dielectric εr" value={epsR} min={1} max={12} step={0.1}
            format={(v) => v.toFixed(1)} onChange={setEpsR} />
          <Slider label="Trace thickness t" value={tMm} min={0} max={0.1} step={0.005}
            format={(v) => `${(v * 1000).toFixed(0)} µm`} onChange={setTMm} />
        </div>
        <p className="caption">
          s = {sMm.toFixed(2)} mm = <strong>{(sMm / hMm).toFixed(1)}·h</strong>. The unit that
          matters is h, not mm: each trace&apos;s return current occupies a corridor ~±3h wide in
          the plane (Module 1), and crosstalk is what happens where those corridors overlap.
        </p>
      </div>

      <div className="panel">
        <h3>Readouts</h3>
        <div className="readouts">
          <div className="readout">
            <div className="label">Z_diff = 2·Z_odd (differential)</div>
            <div className="value big">{fmt(res?.pair.zDiff, 1, ' Ω')}</div>
            <div className="note">
              why &quot;100 Ω differential&quot; exists: two ~50 Ω lines, oddly driven, tightly
              spaced → 2·Z_odd lands near 100 Ω
            </div>
          </div>
          <div className="readout">
            <div className="label">Z_even / Z_odd</div>
            <div className="value" style={{ fontSize: 16 }}>
              {fmt(res?.pair.zEven, 1, ' Ω')} · {fmt(res?.pair.zOdd, 1, ' Ω')}
            </div>
            <div className="note">
              isolated Z₀ = {fmt(res?.isoZ0, 1, ' Ω')} sits between them; Z_comm ={' '}
              {fmt(res?.pair.zComm, 1, ' Ω')}
            </div>
          </div>
          <div className="readout">
            <div className="label">Coupling ratios</div>
            <div className="value" style={{ fontSize: 16 }}>
              Cm/Cs = {fmt(res ? res.pair.cmCs * 100 : null, 1, ' %')} · Lm/Ls ={' '}
              {fmt(res ? res.pair.lmLs * 100 : null, 1, ' %')}
            </div>
            <div className="note">
              {kind === 'stripline'
                ? 'equal in a homogeneous dielectric — that is the FEXT-cancellation theorem'
                : 'unequal because microstrip fields run partly through air'}
            </div>
          </div>
          <div className="readout">
            <div className="label">NEXT / FEXT (this t_r and length)</div>
            <div className="value" style={{ fontSize: 16 }}>
              {fmt(nextPct, 2, ' %')} · {fmt(fextPct, 2, ' %')}
            </div>
            <div className="note">of the aggressor swing; FEXT sign = polarity vs a rising edge</div>
          </div>
          <div className="readout">
            <div className="label">TD (coupled length, isolated ε_eff)</div>
            <div className="value" style={{ fontSize: 16 }}>
              {td !== null ? `${(td * 1e12).toFixed(0)} ps` : '—'}
            </div>
            <div className="note">
              {td !== null && `2·TD ${2 * td >= tr ? '≥' : '<'} t_r → NEXT ${2 * td >= tr ? 'saturated' : 'not yet saturated'}`}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>NEXT / FEXT vs spacing</h3>
        <XtalkSpacingPlot points={sweepPoints} current={current} marks={marks} />
        <p className="caption">
          Solver sweep at coarse grid, cached per geometry (runs on release). The folk rules
          are just points on this curve: s = 3h ends the return-corridor overlap; the
          &quot;3W&quot; rule (center-to-center 3w, i.e. s = 2w) is the same idea measured in
          trace widths. Neither is magic — move the sliders and watch them slide along the
          physics.
        </p>
      </div>

      <div className="panel">
        <h3>Time domain (closed-form pulse model)</h3>
        <div className="controls" style={{ marginBottom: 10 }}>
          <Slider label="Aggressor rise time t_r" value={trPs} min={10} max={1000} log
            format={(v) => `${v.toFixed(0)} ps`} onChange={setTrPs} />
          <Slider label="Coupled length" value={lenMm} min={5} max={300} log
            format={(v) => `${v.toFixed(0)} mm`} onChange={setLenMm} />
        </div>
        {res && td !== null ? (
          <WaveformPlot cmCs={res.pair.cmCs} lmLs={res.pair.lmLs} td={td} tr={tr} />
        ) : (
          <p className="caption">solving…</p>
        )}
        <p className="caption">
          Two different animals: NEXT is a long, low pulse (duration 2·TD) whose amplitude{' '}
          <em>saturates</em> once 2·TD ≥ t_r — more length only makes it wider. FEXT rides
          along with the edge and keeps <em>growing</em> with length (∝ TD/t_r), width ≈ t_r
          {kind === 'stripline'
            ? ' — except here in stripline, where it cancels to zero.'
            : ', negative-going for a rising edge because inductive coupling beats capacitive in microstrip.'}
        </p>
      </div>

      <PhysicsPanel>
        <p>
          <strong>Mode decomposition.</strong> Any excitation of a symmetric pair is a
          superposition of the even mode (1, 1) and the odd mode (1, −1):{' '}
          <Equation tex="V_1 = V_e + V_o,\; V_2 = V_e - V_o" />. Each mode is a proper
          transmission line with its own impedance and speed, extracted by the same two-solve
          method as Module 2, using the per-line charge from the discrete Gauss law:
        </p>
        <Equation
          display
          tex="Z_\mathrm{even} = \frac{1}{c\sqrt{C_e C_{e0}}},\qquad Z_\mathrm{odd} = \frac{1}{c\sqrt{C_o C_{o0}}},\qquad Z_\mathrm{diff} = 2Z_\mathrm{odd},\qquad Z_\mathrm{comm} = \tfrac{1}{2}Z_\mathrm{even}"
        />
        <p>
          <strong>Coupling ratios</strong> follow from the mode capacitances (and, via the
          vacuum solves, inductances — dielectrics never touch L):
        </p>
        <Equation
          display
          tex="\frac{C_m}{C_s} = \frac{C_o - C_e}{C_o + C_e},\qquad \frac{L_m}{L_s} = \frac{L_e - L_o}{L_e + L_o},\qquad L_{e,o} = \frac{1}{c^2\,C_{e0,o0}}"
        />
        <p>
          <strong>Weak-coupling crosstalk</strong> (Hall &amp; Heck 2009, ch. 4; Bogatin 2018,
          ch. 10), for matched terminations and a rising edge of rise time t_r on a coupled
          length of delay TD:
        </p>
        <Equation
          display
          tex="K_b = \tfrac{1}{4}\!\left(\tfrac{C_m}{C_s} + \tfrac{L_m}{L_s}\right)\!,\quad V_\mathrm{NE} = K_b\min\!\left(1, \tfrac{2\,TD}{t_r}\right)\qquad K_f = \tfrac{1}{2}\!\left(\tfrac{C_m}{C_s} - \tfrac{L_m}{L_s}\right)\!,\quad V_\mathrm{FE} = K_f\,\tfrac{TD}{t_r}"
        />
        <p>
          Sign convention: voltages are per unit aggressor swing; V_FE &lt; 0 (a pulse of
          opposite polarity to the rising edge) whenever inductive coupling dominates, as in
          microstrip. The NEXT pulse lasts 2·TD (round trip); the FEXT pulse is the
          derivative-shaped companion of the edge, width ≈ t_r.
        </p>
        <p>
          <strong>The homogeneity theorem.</strong> In a uniform dielectric the field pattern
          is independent of εr, so the capacitance matrix is exactly εr × its vacuum value and
          the inductance matrix is its inverse (times 1/c²) — which forces{' '}
          <Equation tex="L_m/L_s = C_m/C_s" /> and hence <Equation tex="K_f = 0" />: forward
          capacitive and inductive coupling cancel identically. Stripline gets this for free;
          microstrip cannot, because part of its field runs through air. That single fact is
          why serious buses route on inner layers.
        </p>
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>Weak coupling: K ≪ 1, the victim does not load the aggressor (single-pass model).</li>
          <li>Matched terminations at all four ends — no re-reflections of the coupled pulses.</li>
          <li>Lossless, quasi-TEM, no dispersion (static solver, as in Module 2).</li>
          <li>Identical traces (symmetric pair) — the even/odd decomposition requires it.</li>
          <li>TD taken from the isolated line&apos;s ε_eff for both modes (weak-coupling limit).</li>
          <li>Solver grid: ~1–3 % discretization error; spacing snaps to the mesh.</li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
