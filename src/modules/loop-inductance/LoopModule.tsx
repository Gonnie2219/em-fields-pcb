import { useMemo, useState } from 'react';
import { MU_0, RHO_CU } from '../../physics/constants';
import {
  groundBounce,
  internalInductanceLF,
  loopCrossoverFrequency,
  mountingLoopInductance,
  rectLoopInductance,
  skinDepth,
  traceOverPlaneInductancePerMeterHJ,
  traceOverPlaneInductancePerMeterPP,
  wireLoopImpedance,
  wirePairInductancePerMeter,
  wirePairInductancePerMeterLog,
  wireResistance,
} from '../../physics/loopInductance';
import { logspace } from '../../physics/pdn';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import { COPPER_T_MM } from '../stackup/stackupModel';
import { formatHz, formatOhm } from '../pdn/pdnModel';
import { DEPTH_PRESETS, MOUNT_COMPARISONS, formatArea, formatL, formatLen } from './loopModel';
import { LoopAreaCanvas } from './LoopAreaCanvas';
import { WireLoopZPlot } from './WireLoopZPlot';

const TABS = [
  { id: 'wire-loop', label: 'Wire loop' },
  { id: 'wire-pair', label: 'Wire pair' },
  { id: 'trace-plane', label: 'Trace over plane' },
  { id: 'mounting', label: 'Cap mounting loop' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const FREQS = logspace(10, 1e9, 600);
const TRACE_T = COPPER_T_MM * 1e-3;

/** Always-visible comparison: 1 cm of wire pair vs 1 cm of trace over a plane. */
const STRIP = {
  pair: wirePairInductancePerMeter(10e-3, 0.5e-3) * 0.01,
  trace: traceOverPlaneInductancePerMeterHJ(0.2e-3, 3e-3) * 0.01,
};

export function LoopModule() {
  const [tab, setTab] = useState<TabId>('wire-loop');

  // Wire loop
  const [aCm, setACm] = useState(10);
  const [bCm, setBCm] = useState(10);
  const [wireDiaMm, setWireDiaMm] = useState(1);
  const [internal, setInternal] = useState(false);

  // Wire pair
  const [pairDMm, setPairDMm] = useState(10);
  const [pairRMm, setPairRMm] = useState(0.5);

  // Trace over plane
  const [traceWMm, setTraceWMm] = useState(3);
  const [traceHMm, setTraceHMm] = useState(0.2);

  // Mounting loop
  const [spanMm, setSpanMm] = useState(1.5);
  const [escapeMm, setEscapeMm] = useState(0.5);
  const [escWMm, setEscWMm] = useState(0.3);
  const [depthId, setDepthId] = useState<string>('good-si');
  const [customDepthMm, setCustomDepthMm] = useState(0.36);

  // Ground bounce
  const [gbLnH, setGbLnH] = useState(5);
  const [gbDiA, setGbDiA] = useState(0.32);
  const [gbTrNs, setGbTrNs] = useState(1);

  const wireLoop = useMemo(() => {
    const a = aCm * 1e-2;
    const b = bCm * 1e-2;
    const r = (wireDiaMm / 2) * 1e-3;
    const perimeter = 2 * (a + b);
    const lExt = rectLoopInductance(a, b, r);
    const lInt = internalInductanceLF(perimeter);
    const L = internal ? lExt + lInt : lExt;
    const rDc = (RHO_CU * perimeter) / (Math.PI * r * r);
    const fc = loopCrossoverFrequency(perimeter, r, L);
    // Frequency where δ = r — below it the internal-inductance term is valid.
    const fSkin = RHO_CU / (Math.PI * MU_0 * r * r);
    const zMag = Float64Array.from(FREQS, (f) => wireLoopImpedance(f, perimeter, r, L).mag);
    const rOfF = Float64Array.from(FREQS, (f) => wireResistance(f, perimeter, r));
    const xOfF = Float64Array.from(FREQS, (f) => 2 * Math.PI * f * L);
    return { a, b, r, perimeter, lExt, lInt, L, rDc, fc, fSkin, zMag, rOfF, xOfF };
  }, [aCm, bCm, wireDiaMm, internal]);

  const pair = useMemo(() => {
    const r = pairRMm * 1e-3;
    const D = Math.max(pairDMm * 1e-3, 2.05 * r); // keep the wires from overlapping
    const perM = wirePairInductancePerMeter(D, r);
    const perMLog = wirePairInductancePerMeterLog(D, r);
    return { D, r, perM, perMLog, logErr: (perMLog - perM) / perM };
  }, [pairDMm, pairRMm]);

  const trace = useMemo(() => {
    const w = traceWMm * 1e-3;
    const h = traceHMm * 1e-3;
    const pp = traceOverPlaneInductancePerMeterPP(h, w);
    const hj = traceOverPlaneInductancePerMeterHJ(h, w);
    return { w, h, pp, hj, gap: (pp - hj) / pp };
  }, [traceWMm, traceHMm]);

  const mounting = useMemo(() => {
    const depthMm = DEPTH_PRESETS.find((d) => d.id === depthId)?.mm ?? customDepthMm;
    const geo = {
      span: spanMm * 1e-3,
      escape: escapeMm * 1e-3,
      traceW: escWMm * 1e-3,
      traceT: TRACE_T,
    };
    const L = mountingLoopInductance({ ...geo, depth: depthMm * 1e-3 });
    const lThin = mountingLoopInductance({ ...geo, depth: 0.2e-3 });
    const lThick = mountingLoopInductance({ ...geo, depth: 1.6e-3 });
    const presetRows = MOUNT_COMPARISONS.map((c) => ({
      ...c,
      modelNh:
        mountingLoopInductance({
          span: 1.5e-3,
          escape: c.escapeMm * 1e-3,
          depth: 0.36e-3,
          traceW: 0.3e-3,
          traceT: TRACE_T,
        }) * 1e9,
    }));
    return { depthMm, geo, L, lThin, lThick, presetRows };
  }, [spanMm, escapeMm, escWMm, depthId, customDepthMm]);

  const gbV = groundBounce(gbLnH * 1e-9, gbDiA, gbTrNs * 1e-9);

  return (
    <>
      <div className="panel">
        <h3>1 cm of loop, two ways</h3>
        <div className="readouts">
          <div className="readout">
            <div className="label">wire pair · D = 10 mm, r = 0.5 mm</div>
            <div className="value">{formatL(STRIP.pair)}</div>
            <div className="note">a big open loop window</div>
          </div>
          <div className="readout">
            <div className="label">3 mm trace over a plane 0.2 mm below (fringing incl.)</div>
            <div className="value">{formatL(STRIP.trace)}</div>
            <div className="note">the plane return hugs the trace — tiny window</div>
          </div>
          <div className="readout">
            <div className="label">ratio</div>
            <div className="value">≈ {(STRIP.pair / STRIP.trace).toFixed(0)}×</div>
            <div className="note">thin dielectric = small loop (Modules 1–3)</div>
          </div>
        </div>
        <p className="caption">
          Same lesson as Module 1&apos;s slot: any detour of the return current is added loop
          area, and added loop area is added inductance.
        </p>
      </div>

      <div className="panel">
        <div className="segmented" style={{ marginBottom: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'wire-loop' && (
          <>
            <LoopAreaCanvas scene={{ kind: 'wire-loop', a: wireLoop.a, b: wireLoop.b }} />
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Side a" value={aCm} min={2} max={30} step={0.5}
                format={(v) => `${v.toFixed(1)} cm`} onChange={setACm} />
              <Slider label="Side b" value={bCm} min={2} max={30} step={0.5}
                format={(v) => `${v.toFixed(1)} cm`} onChange={setBCm} />
              <Slider label="Wire diameter" value={wireDiaMm} min={0.2} max={5} step={0.1}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setWireDiaMm} />
            </div>
            <p style={{ margin: '10px 0 4px' }}>
              <label className="toggle">
                <input type="checkbox" checked={internal}
                  onChange={(e) => setInternal(e.target.checked)} />
                add low-frequency internal inductance µ0/(8π) per metre of wire
                (+{formatL(wireLoop.lInt)})
              </label>
            </p>
            <p className="caption">
              The internal term lives in the flux inside the wire, so it is only there while
              the current fills the wire: for this wire δ = r at ≈ {formatHz(wireLoop.fSkin)}
              {' '}(δ = {formatLen(skinDepth(wireLoop.fSkin))} — Module 1&apos;s skin depth).
              Well above that, skin effect expels it and only the external {formatL(wireLoop.lExt)}
              {' '}remains.
            </p>
            <div className="readouts" style={{ marginTop: 10 }}>
              <div className="readout">
                <div className="label">Loop inductance L{internal ? ' (ext + int)' : ' (external)'}</div>
                <div className="value big">{formatL(wireLoop.L)}</div>
              </div>
              <div className="readout">
                <div className="label">Loop area</div>
                <div className="value">{formatArea(wireLoop.a * wireLoop.b)}</div>
              </div>
              <div className="readout">
                <div className="label">DC resistance</div>
                <div className="value">{formatOhm(wireLoop.rDc)}</div>
              </div>
              <div className="readout">
                <div className="label">Crossover f_c (ωL = R)</div>
                <div className="value">{formatHz(wireLoop.fc)}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <WireLoopZPlot freqs={FREQS} zMag={wireLoop.zMag} rOfF={wireLoop.rOfF}
                xOfF={wireLoop.xOfF} fc={wireLoop.fc} />
              <p className="caption">
                Above ~{formatHz(wireLoop.fc)} this wire is an inductor, not a wire. Everything
                past the crossover — which for a 10 cm loop of ordinary hookup wire is a few
                kilohertz — sees ωL, not the milliohms on the multimeter.
              </p>
            </div>
          </>
        )}

        {tab === 'wire-pair' && (
          <>
            <LoopAreaCanvas scene={{ kind: 'wire-pair', D: pair.D, r: pair.r }} />
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Spacing D" value={pairDMm} min={2} max={50} step={0.5}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setPairDMm} />
              <Slider label="Wire radius r" value={pairRMm} min={0.1} max={1} step={0.05}
                format={(v) => `${v.toFixed(2)} mm`} onChange={setPairRMm} />
            </div>
            <div className="readouts" style={{ marginTop: 10 }}>
              <div className="readout">
                <div className="label">L′ (go + return)</div>
                <div className="value big">{(pair.perM * 1e9).toFixed(0)} nH/m</div>
                <div className="note">= {(pair.perM * 1e9 * 0.01).toFixed(2)} nH per cm</div>
              </div>
              <div className="readout">
                <div className="label">Loop window per cm</div>
                <div className="value">{formatArea(pair.D * 0.01)}</div>
              </div>
              <div className="readout">
                <div className="label">ln(D/r) approximation</div>
                <div className="value">{(pair.perMLog * 1e9).toFixed(0)} nH/m</div>
                <div className="note">
                  {(pair.logErr * 100).toFixed(1)} % off the acosh form here
                </div>
              </div>
            </div>
            <p className="caption">
              <Equation tex="L' = \frac{\mu_0}{\pi}\,\mathrm{acosh}\!\frac{D}{2r}" /> — only
              logarithmic in the geometry: doubling the spacing adds a fixed ~0.28 µH/m, which
              is why “about 1 µH/m” covers most practical wire pairs.
            </p>
          </>
        )}

        {tab === 'trace-plane' && (
          <>
            <LoopAreaCanvas scene={{ kind: 'trace-plane', w: trace.w, h: trace.h }} />
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Trace width w" value={traceWMm} min={0.5} max={10} step={0.1}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setTraceWMm} />
              <Slider label="Height above plane h" value={traceHMm} min={0.1} max={2} step={0.02}
                format={(v) => `${v.toFixed(2)} mm`} onChange={setTraceHMm} />
            </div>
            <div className="readouts" style={{ marginTop: 10 }}>
              <div className="readout">
                <div className="label">Ideal parallel-plate L′ = µ0·h/w</div>
                <div className="value">{(trace.pp * 1e9).toFixed(1)} nH/m</div>
                <div className="note">= {(trace.pp * 1e9 * 0.01).toFixed(3)} nH per cm</div>
              </div>
              <div className="readout">
                <div className="label">With fringing (Hammerstad–Jensen, εr = 1)</div>
                <div className="value">{(trace.hj * 1e9).toFixed(1)} nH/m</div>
                <div className="note">= {(trace.hj * 1e9 * 0.01).toFixed(3)} nH per cm</div>
              </div>
              <div className="readout">
                <div className="label">The gap between them IS fringing</div>
                <div className="value">−{(trace.gap * 100).toFixed(0)} %</div>
                <div className="note">
                  return flux escapes the w × h slab; dies off only logarithmically with w/h
                </div>
              </div>
            </div>
            <p className="caption">
              Same Hammerstad–Jensen Z₀ as Module 2, evaluated in vacuum:{' '}
              <Equation tex="L' = Z_0(\varepsilon_r{=}1)/c" />. No field solve — and yet it
              knows about fringing, because Z₀ does.
            </p>
          </>
        )}

        {tab === 'mounting' && (
          <>
            <LoopAreaCanvas
              scene={{
                kind: 'mounting',
                span: spanMm * 1e-3,
                escape: escapeMm * 1e-3,
                depth: mounting.depthMm * 1e-3,
              }}
            />
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Cap body span" value={spanMm} min={0.5} max={5} step={0.1}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setSpanMm} />
              <Slider label="Escape length (each side)" value={escapeMm} min={0} max={5} step={0.1}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setEscapeMm} />
              <Slider label="Escape trace width" value={escWMm} min={0.1} max={1} step={0.05}
                format={(v) => `${v.toFixed(2)} mm`} onChange={setEscWMm} />
            </div>
            <div className="checks">
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                depth to nearest plane (a stackup property — Module 3):
              </span>
              <div className="segmented">
                {DEPTH_PRESETS.map((d) => (
                  <button key={d.id} className={depthId === d.id ? 'active' : ''}
                    onClick={() => setDepthId(d.id)}>
                    {d.label}
                  </button>
                ))}
                <button className={depthId === 'custom' ? 'active' : ''}
                  onClick={() => setDepthId('custom')}>
                  custom
                </button>
              </div>
              {depthId === 'custom' && (
                <div style={{ minWidth: 200 }}>
                  <Slider label="Custom depth" value={customDepthMm} min={0.1} max={2} step={0.02}
                    format={(v) => `${v.toFixed(2)} mm`} onChange={setCustomDepthMm} />
                </div>
              )}
            </div>
            <div className="readouts" style={{ marginTop: 10 }}>
              <div className="readout">
                <div className="label">Mounting L at {mounting.depthMm.toFixed(2)} mm depth</div>
                <div className="value big">{formatL(mounting.L)}</div>
                <div className="note">rectangle-loop estimate, ~±30 %</div>
              </div>
              <div className="readout">
                <div className="label">Identical layout: 0.2 mm vs 1.6 mm depth</div>
                <div className="value">
                  {formatL(mounting.lThin)} → {formatL(mounting.lThick)}
                </div>
                <div className="note">
                  ≈ {(mounting.lThick / mounting.lThin).toFixed(1)}× the inductance from the
                  stackup alone — before you route a single trace differently
                </div>
              </div>
            </div>
            <table className="stack-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Module 4 preset</th>
                  <th>comparable geometry</th>
                  <th>this model</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mounting.presetRows.map((row) => {
                  const ratio = row.modelNh / row.presetNh;
                  const off = ratio > 1.5 || ratio < 1 / 1.5;
                  return (
                    <tr key={row.presetLabel}>
                      <td>{row.presetLabel}</td>
                      <td>
                        1.5 mm span + 2 × {row.escapeMm} mm escape, 0.36 mm depth
                      </td>
                      <td>{row.modelNh.toFixed(1)} nH</td>
                      <td style={{ color: off ? '#fab219' : 'var(--muted)' }}>
                        {off ? `model ${ratio.toFixed(1)}× the preset` : 'agrees'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="caption">
              The model runs consistently above Module 4&apos;s folk presets — shown, not tuned
              away. Caveat: the rectangle model treats the plane return as a wire as narrow as
              the escape trace, but a real plane returns the current as a spread image
              (Module 1), which roughly halves the horizontal-run term of the loop in the
              wide-gap limit — so the model reads high, consistent with the gap flagged
              above. Both numbers stay on the table: treat the model as an upper-ish estimate
              and the presets as measurement-derived folklore.
            </p>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Ground bounce: V = L·ΔI/Δt</h3>
        <div className="controls">
          <Slider label="Shared inductance L" value={gbLnH} min={0.5} max={20} step={0.1}
            format={(v) => `${v.toFixed(1)} nH`} onChange={setGbLnH} />
          <Slider label="Current step ΔI" value={gbDiA} min={0.01} max={5} log
            format={(v) => `${v < 1 ? (v * 1e3).toFixed(0) + ' mA' : v.toFixed(2) + ' A'}`}
            onChange={setGbDiA} />
          <Slider label="Transition time Δt" value={gbTrNs} min={0.1} max={10} log
            format={(v) => `${v.toFixed(2)} ns`} onChange={setGbTrNs} />
        </div>
        <div className="checks">
          <button
            className="segmented"
            style={{ padding: '5px 12px', cursor: 'pointer', background: 'none',
              color: 'var(--ink-2)', font: 'inherit', fontSize: 12 }}
            onClick={() => {
              setGbLnH(5);
              setGbDiA(0.32);
              setGbTrNs(1);
            }}
          >
            preset: 16 outputs × 20 mA in 1 ns through 5 nH of shared lead
          </button>
          <div className="readout" style={{ minWidth: 180 }}>
            <div className="label">bounce voltage</div>
            <div className="value big" style={{ color: gbV > 0.4 ? '#ec835a' : 'var(--ink)' }}>
              {gbV.toFixed(2)} V
            </div>
          </div>
        </div>
        <p className="caption">
          The preset is the classic disaster: sixteen outputs switching together lift the
          “ground” pin by 1.6 V — more than a modern logic threshold. The only fixes are less
          L (smaller loop, more pins in parallel) or slower edges.
        </p>
      </div>

      <PhysicsPanel>
        <p>
          <strong>Inductance belongs to loops.</strong>{' '}
          <Equation tex="L = \Phi/I" /> — the flux through the closed current path per ampere —
          and the stored energy is <Equation tex="W = \tfrac{1}{2} L I^2" />. Until the loop
          closes, Φ is undefined: asking for “the inductance of a wire” is like asking for the
          area enclosed by one side of a rectangle.
        </p>
        <p>
          <strong>Partial vs. loop inductance.</strong> “A wire has ~1 nH per mm” is a{' '}
          <em>partial</em> inductance — a bookkeeping split of the loop integral among its
          segments (Rosa 1908). It only predicts anything once every segment of the loop is
          summed, mutuals included; a segment&apos;s own number can be halved or doubled by
          where the return path runs. The rectangle formula used here is exactly that sum:
        </p>
        <Equation
          display
          tex="L = \frac{\mu_0}{\pi}\Big[a\ln\frac{2a}{r} + b\ln\frac{2b}{r} - a\ln\frac{a+g}{b} - b\ln\frac{b+g}{a} + 2g - 2(a+b)\Big],\quad g=\sqrt{a^2+b^2}"
        />
        <p>
          (Rosa 1908; Grover 1946, ch. 8. For a square it reduces to{' '}
          <Equation tex="L = \tfrac{2\mu_0 s}{\pi}\left[\ln(s/r) - 0.774\right]" />.)
        </p>
        <p>
          <strong>External vs. internal.</strong> The formula above is the external inductance
          (flux outside the wire; surface current). At low frequency current also fills the
          wire and its internal flux adds <Equation tex="\mu_0/8\pi \approx 50" /> nH per meter
          of wire, independent of radius. Skin effect (Module 1,{' '}
          <Equation tex="\delta = \sqrt{2\rho/\omega\mu}" />) expels the current — and with it
          the internal flux — once <Equation tex="\delta \ll r" />, which is why HF inductance
          is purely geometric.
        </p>
        <p>
          <strong>Other closed forms used here</strong> — wire pair (Pozar 2012, Table 2.1):{' '}
          <Equation tex="L' = \tfrac{\mu_0}{\pi}\,\mathrm{acosh}\tfrac{D}{2r} \approx \tfrac{\mu_0}{\pi}\ln\tfrac{D}{r}" />;
          trace over plane: <Equation tex="L' = \mu_0 h/w" /> (parallel-plate) vs.{' '}
          <Equation tex="L' = Z_0(\varepsilon_r{=}1)/c" /> (Hammerstad–Jensen 1980, as in
          Module 2); flat conductors enter the round-wire formulas through the GMD radius{' '}
          <Equation tex="r_\mathrm{eff} = 0.2235\,(w+t)" /> (Rosa/Grover); wire impedance{' '}
          <Equation tex="Z = R(f) + j\omega L" /> with R stepping from{' '}
          <Equation tex="\rho l/\pi r^2" /> to the skin shell{' '}
          <Equation tex="\rho l / \pi\big(r^2 - (r-\delta)^2\big)" />; ground bounce{' '}
          <Equation tex="V = L\,\Delta I/\Delta t" />.
        </p>
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>Thin-wire formulas: r ≪ loop dimensions; quasi-static (loop ≪ λ), no radiation.</li>
          <li>
            The mounting-loop model is an estimate (~±30 %): plane return treated as a narrow
            wire, no spreading inductance, no proximity effect, vias folded into the escape
            trace&apos;s r_eff.
          </li>
          <li>
            The skin-shell R(f) is the standard engineering approximation to the exact Bessel
            solution (a few % for r/δ ≳ 2); internal inductance is all-or-nothing via the
            toggle rather than smoothly frequency-dependent.
          </li>
          <li>Non-magnetic conductors (µ = µ0); copper resistivity throughout.</li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
