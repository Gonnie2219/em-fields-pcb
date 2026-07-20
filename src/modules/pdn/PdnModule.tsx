import { useMemo, useState } from 'react';
import {
  localMaxima,
  logspace,
  pdnImpedance,
  planeBranch,
  selfResonantFrequency,
  targetImpedance,
  zMag,
  type CapSpec,
} from '../../physics/pdn';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { PRESETS, planePairs } from '../stackup/stackupModel';
import {
  MOUNT_PRESETS,
  SCENARIOS,
  applyScenario,
  findViolations,
  formatEng,
  formatHz,
  formatOhm,
  parseEng,
  rowToSpec,
  type CapRow,
} from './pdnModel';
import { PdnPlot, type Curve, type Peak } from './PdnPlot';

const FREQS = logspace(1e3, 1e9, 1000);
const ROW_COLORS = ['#3987e5', '#199e70', '#c98500', '#9085e9', '#d55181', '#d95926'];
const PLANE_AREA_M2 = 0.01; // 100 × 100 mm
const PLANE_EPS_R = 4.4;

const magCurve = (specs: CapSpec[]) =>
  Float64Array.from(FREQS, (f) => zMag(pdnImpedance(specs, 2 * Math.PI * f)));

export function PdnModule() {
  const [rows, setRows] = useState<CapRow[]>(() => applyScenario(SCENARIOS[1]!));
  const [scenarioId, setScenarioId] = useState('decade');
  const [ideal, setIdeal] = useState(false);
  const [includePlane, setIncludePlane] = useState(true);
  const [stackupId, setStackupId] = useState('6l-good');
  const [lPlanePh, setLPlanePh] = useState(10);
  const [vRail, setVRail] = useState(1);
  const [ripplePct, setRipplePct] = useState(5);
  const [dI, setDI] = useState(2);
  const [bandLoMHz, setBandLoMHz] = useState(0.1);
  const [bandHiMHz, setBandHiMHz] = useState(100);

  const edit = (id: string, patch: Partial<CapRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setScenarioId('custom');
  };

  const stackupPair = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === stackupId)!;
    const pairs = planePairs(preset.stackup);
    return pairs.length ? pairs.reduce((a, b) => (a.dMm <= b.dMm ? a : b)) : null;
  }, [stackupId]);

  const target = targetImpedance(vRail, ripplePct / 100, dI);

  const computed = useMemo(() => {
    const active = rows.filter((r) => r.n > 0);
    const specs = active.map((r) => rowToSpec(r, ideal));
    const planeSpec =
      includePlane && stackupPair
        ? planeBranch(PLANE_EPS_R, stackupPair.dMm * 1e-3, PLANE_AREA_M2, lPlanePh * 1e-12)
        : null;
    const all = planeSpec ? [...specs, planeSpec] : specs;
    const combined = magCurve(all);

    const srfs = [
      ...active.map((r) => ({ name: r.name, srf: selfResonantFrequency(rowToSpec(r, ideal)) })),
      ...(planeSpec ? [{ name: 'planes', srf: selfResonantFrequency(planeSpec) }] : []),
    ].sort((a, b) => a.srf - b.srf);

    const peaks: Peak[] = localMaxima(combined)
      .filter((i) => combined[i]! > target)
      .map((i) => {
        const f = FREQS[i]!;
        const below = [...srfs].reverse().find((s) => s.srf < f);
        const above = srfs.find((s) => s.srf > f);
        const label =
          below && above ? `${below.name} ↔ ${above.name}` : below?.name ?? above?.name ?? '';
        return { f, z: combined[i]!, label };
      });

    const curves: Curve[] = [
      ...active.map((r) => ({
        label: `${r.n} × ${r.name}`,
        color: ROW_COLORS[rows.findIndex((x) => x.id === r.id) % ROW_COLORS.length]!,
        width: 1.25,
        z: magCurve([rowToSpec(r, ideal)]),
      })),
      ...(planeSpec
        ? [
            {
              label: `plane pair (${(planeSpec.C * 1e9).toFixed(2)} nF)`,
              color: '#c3c2b7',
              width: 1.25,
              dash: [5, 4],
              z: magCurve([planeSpec]),
            },
          ]
        : []),
      { label: 'combined PDN', color: '#ffffff', width: 2.5, z: combined },
    ];

    const violations = findViolations(FREQS, combined, target);
    let worst = { f: NaN, z: -Infinity };
    FREQS.forEach((f, i) => {
      if (f >= bandLoMHz * 1e6 && f <= bandHiMHz * 1e6 && combined[i]! > worst.z) {
        worst = { f, z: combined[i]! };
      }
    });

    return { curves, combined, peaks, violations, worst, srfs, planeSpec };
  }, [rows, ideal, includePlane, stackupPair, lPlanePh, target, bandLoMHz, bandHiMHz]);

  const num = (v: number, set: (x: number) => void, step = 1, width = 64) => (
    <input
      type="number"
      value={v}
      step={step}
      style={{ width }}
      onChange={(e) => {
        const x = Number(e.target.value);
        if (Number.isFinite(x)) set(x);
      }}
    />
  );

  return (
    <>
      <div className="panel">
        <h3>|Z| of the power distribution network</h3>
        <PdnPlot
          freqs={FREQS}
          curves={computed.curves}
          hoverIndex={computed.curves.length - 1}
          target={target}
          peaks={computed.peaks}
        />
        <p className="caption">
          Shaded bands: which part of the PDN can actually deliver charge in that frequency
          range. Red circles mark anti-resonances of the combined curve that break the target,
          labeled with the pair of self-resonances that created them.
        </p>
      </div>

      <div className="panel">
        <h3>Scenarios &amp; options</h3>
        <div className="segmented" style={{ marginBottom: 10 }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={scenarioId === s.id ? 'active' : ''}
              onClick={() => {
                setRows(applyScenario(s));
                setScenarioId(s.id);
              }}
            >
              {s.name}
            </button>
          ))}
          <button className={scenarioId === 'custom' ? 'active' : ''} disabled>
            custom
          </button>
        </div>
        <div className="checks">
          <label className="toggle">
            <input type="checkbox" checked={ideal} onChange={(e) => setIdeal(e.target.checked)} />
            ideal caps (no ESR / ESL / mounting L)
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={includePlane}
              onChange={(e) => setIncludePlane(e.target.checked)}
            />
            plane branch
          </label>
          <label className="toggle">
            stackup
            <select value={stackupId} onChange={(e) => setStackupId(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">L_plane {num(lPlanePh, setLPlanePh, 1, 56)} pH</label>
        </div>
        {includePlane && !stackupPair && (
          <p className="caption">
            This stackup has no adjacent P–G pair — no plane branch (exactly what Module 3&apos;s
            scorecard warned about).
          </p>
        )}
        <div className="checks" style={{ marginTop: 8 }}>
          <label className="toggle">V_rail {num(vRail, setVRail, 0.1, 56)} V</label>
          <label className="toggle">ripple {num(ripplePct, setRipplePct, 0.5, 56)} %</label>
          <label className="toggle">ΔI {num(dI, setDI, 0.5, 56)} A</label>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            → target Z_t = {formatOhm(target)}
          </span>
        </div>
      </div>

      <div className="panel">
        <h3>PDN builder</h3>
        <table className="stack-table">
          <thead>
            <tr>
              <th>part</th>
              <th>C</th>
              <th>ESR (mΩ)</th>
              <th>ESL (nH)</th>
              <th>mounting L</th>
              <th>count n</th>
              <th>SRF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ opacity: r.n > 0 ? 1 : 0.45 }}>
                <td>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: ROW_COLORS[i % ROW_COLORS.length],
                      marginRight: 8,
                    }}
                  />
                  {r.name}
                </td>
                <td>
                  <input
                    key={`${r.id}:${r.C}`}
                    type="text"
                    defaultValue={`${formatEng(r.C)}F`}
                    style={{ width: 64 }}
                    onBlur={(e) => {
                      const v = parseEng(e.target.value);
                      if (v && v > 0) edit(r.id, { C: v });
                    }}
                  />
                </td>
                <td>{num(r.esrMohm, (x) => edit(r.id, { esrMohm: Math.max(0, x) }), 5)}</td>
                <td>{num(r.eslNh, (x) => edit(r.id, { eslNh: Math.max(0, x) }), 0.1)}</td>
                <td>
                  <select
                    value={r.lMountNh}
                    onChange={(e) => edit(r.id, { lMountNh: Number(e.target.value) })}
                  >
                    {MOUNT_PRESETS.map((m) => (
                      <option key={m.nH} value={m.nH}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{num(r.n, (x) => edit(r.id, { n: Math.max(0, Math.round(x)) }), 1, 52)}</td>
                <td>
                  {r.n > 0 ? formatHz(selfResonantFrequency(rowToSpec(r, ideal))) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption">
          Mounting L is Module 1&apos;s lesson in disguise: it is the loop area of the
          pad-via-plane path. Via-in-pad shrinks the loop; long traces balloon it.
        </p>
      </div>

      <div className="panel">
        <h3>Readouts</h3>
        <div className="readouts">
          <div className="readout">
            <div className="label">
              Worst |Z| between {num(bandLoMHz, setBandLoMHz, 0.1, 56)} and{' '}
              {num(bandHiMHz, setBandHiMHz, 10, 56)} MHz
            </div>
            <div
              className="value"
              style={{ color: computed.worst.z > target ? '#ec835a' : '#0ca30c' }}
            >
              {formatOhm(computed.worst.z)}
            </div>
            <div className="note">
              at {formatHz(computed.worst.f)} · target {formatOhm(target)}
            </div>
          </div>
          <div className="readout">
            <div className="label">Target violations</div>
            {computed.violations.length === 0 ? (
              <div className="value" style={{ fontSize: 15, color: '#0ca30c' }}>
                none — PDN meets target everywhere
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>
                {computed.violations.slice(0, 4).map((v, i) => (
                  <div key={i}>
                    {formatHz(v.f0)} – {formatHz(v.f1)} (peak {formatOhm(v.peakZ)} at{' '}
                    {formatHz(v.peakF)})
                  </div>
                ))}
                {computed.violations.length > 4 && <div>…</div>}
              </div>
            )}
          </div>
          <div className="readout">
            <div className="label">Self-resonant frequencies</div>
            <div style={{ fontSize: 12 }}>
              {computed.srfs.map((s) => (
                <div key={s.name}>
                  {s.name}: {formatHz(s.srf)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PhysicsPanel>
        <p>
          <strong>A real capacitor is a series RLC circuit.</strong> Package inductance (ESL)
          plus the mounting loop give a total series L, so
        </p>
        <Equation
          display
          tex="Z(\omega) = \mathrm{ESR} + j\left(\omega L_\mathrm{tot} - \frac{1}{\omega C}\right),\qquad f_\mathrm{SRF} = \frac{1}{2\pi\sqrt{L_\mathrm{tot}\,C}}"
        />
        <p>
          Below SRF it behaves as a capacitor, above SRF as an inductor, and at SRF{' '}
          <Equation tex="|Z| = \mathrm{ESR}" />. A “100 nF capacitor” at 500 MHz is really a
          ~1 nH inductor that happens to contain a dielectric.
        </p>
        <p>
          <strong>Anti-resonance.</strong> Where one capacitor type has already gone inductive
          and a smaller one is still capacitive, the pair forms a parallel LC tank: at the tank
          frequency their susceptances cancel and the combined |Z| peaks. Only the ESRs damp
          the peak — which is why ultra-low-ESR ceramics produce the tallest anti-resonances.
        </p>
        <p>
          <strong>Target impedance</strong> <Equation tex="Z_t = V\cdot r/\Delta I" /> bounds
          ripple: if |Z| stays below Z_t, a ΔI transient moves the rail by at most V·r.
        </p>
        <p>
          <strong>Why the “army” works.</strong> n identical capacitors divide the whole curve
          by n — same shape, same SRF, no new resonances, because paralleling identical
          branches cannot create a new pole. Mixing values buys bandwidth but pays for it in
          anti-resonance peaks; mixing ESR back in (controlled damping) is the cure.
        </p>
        <p>
          <strong>Callbacks.</strong> Mounting inductance is Module 1&apos;s loop area: the
          pad–via–plane current loop. The plane branch is Module 3&apos;s interplane
          capacitance <Equation tex="C'' = \varepsilon_0\varepsilon_r/d" /> — the
          essentially inductance-free capacitor that supplies charge above every MLCC&apos;s
          SRF, and the reason the scorecard flags P–G spacing.
        </p>
        <p><strong>Assumptions &amp; where they break:</strong></p>
        <ul>
          <li>
            Lumped elements only — valid while parts are ≪ λ; above ~1 GHz distributed effects
            dominate.
          </li>
          <li>
            No plane cavity resonances — real plane pairs resonate (λ/2 modes) from a few
            hundred MHz; the plane branch here stays smooth.
          </li>
          <li>
            No spreading inductance — charge reaching a far-away capacitor sees extra plane
            inductance we ignore; placement stops mattering in this model, which is optimistic.
          </li>
          <li>C, ESR, ESL constant with frequency and bias (real MLCCs derate heavily).</li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
