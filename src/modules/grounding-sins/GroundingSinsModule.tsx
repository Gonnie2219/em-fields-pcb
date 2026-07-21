import { useMemo, useState } from 'react';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import {
  detourInductance,
  groundBounce,
  localPatchCapacitance,
  seriesCrossoverFrequency,
  slotDetourInductance,
  zReturn,
  type DcPlaneParams,
} from '../../physics/groundingSins';
import { logspace, zMag, type CapSpec } from '../../physics/pdn';
import { PdnPlot, type Peak } from '../pdn/PdnPlot';
import { formatHz } from '../pdn/pdnModel';
import { formatL } from '../loop-inductance/loopModel';
import {
  BOARD,
  DC_GRID,
  L_VIA,
  STITCH_CAP,
  TRACE,
  VIA,
  moatRect,
  nearestEndY,
  slotRect,
} from './sinsModel';
import { PlanViewCanvas } from './PlanViewCanvas';
import { LayerHopView } from './LayerHopView';
import { useDcSolve } from './useDcSolve';

const TABS = [
  { id: 'slot', label: 'A · Slot under a trace' },
  { id: 'moat', label: 'B · Split plane / moat' },
  { id: 'hop', label: 'C · Layer hop' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const EPS_R = 4.3;
const FREQS_HOP = logspace(1e6, 1e10, 480);
const HOP_BANDS: { f0: number; f1: number; label: string }[] = [];

/** Readout strip shared by scenarios A and B: detour, ΔL, ground bounce. */
function BounceStrip({
  detourText,
  dL,
  dIdtMaNs,
  onDIdt,
}: {
  detourText: string;
  dL: number;
  dIdtMaNs: number;
  onDIdt: (v: number) => void;
}) {
  const v = groundBounce(dL, dIdtMaNs * 1e-3, 1e-9);
  return (
    <div className="checks" style={{ marginTop: 10, alignItems: 'center' }}>
      <div className="readout">
        <div className="label">return detour</div>
        <div className="value">{detourText}</div>
      </div>
      <div className="readout">
        <div className="label">added inductance ΔL</div>
        <div className="value big" style={{ color: dL > 5e-9 ? '#ec835a' : 'var(--ink)' }}>
          {formatL(dL)}
        </div>
        <div className="note">order-of-magnitude estimate</div>
      </div>
      <div style={{ minWidth: 210 }}>
        <Slider label="dI/dt" value={dIdtMaNs} min={10} max={500} log
          format={(x) => `${x.toFixed(0)} mA/ns`} onChange={onDIdt} />
      </div>
      <div className="readout">
        <div className="label">ground bounce V = ΔL·dI/dt</div>
        <div className="value big" style={{ color: v > 0.3 ? '#ec835a' : 'var(--ink)' }}>
          {v >= 1 ? `${v.toFixed(2)} V` : `${(v * 1e3).toFixed(0)} mV`}
        </div>
      </div>
    </div>
  );
}

export function GroundingSinsModule() {
  const [tab, setTab] = useState<TabId>('slot');
  const [hMm, setHMm] = useState(0.2);
  const [dIdtMaNs, setDIdtMaNs] = useState(50);

  // A — slot
  const [slotLenMm, setSlotLenMm] = useState(20);
  const [slotWMm, setSlotWMm] = useState(1);
  const [slotXMm, setSlotXMm] = useState(50);
  const [crossFrac, setCrossFrac] = useState(0);
  const [slotView, setSlotView] = useState<'hf' | 'dc'>('hf');
  const [fixVias, setFixVias] = useState(false);

  // B — moat
  const [moatLenMm, setMoatLenMm] = useState(45);
  const [moatWMm, setMoatWMm] = useState(2);
  const [moatFix, setMoatFix] = useState<'none' | 'bridge' | 'cap'>('none');
  const [bridgeYMm, setBridgeYMm] = useState(45);

  // C — layer hop
  const [patchSideMm, setPatchSideMm] = useState(10);
  const [planeDMm, setPlaneDMm] = useState(0.2);
  const [capCnF, setCapCnF] = useState(100);

  const slot = useMemo(() => {
    const offMm = (crossFrac * slotLenMm) / 2;
    const rect = slotRect(slotXMm, slotLenMm, slotWMm, offMm);
    const aMm = slotLenMm / 2 - Math.abs(offMm);
    const dLDetour = slotDetourInductance(
      slotLenMm * 1e-3, slotWMm * 1e-3, offMm * 1e-3, hMm * 1e-3, TRACE.wMm * 1e-3,
    );
    const dL = fixVias ? 2 * L_VIA : dLDetour;
    const detourText = fixVias
      ? `2 hops × ${VIA.hMm} mm via`
      : `${(2 * aMm + slotWMm).toFixed(1)} mm extra path (a = ${aMm.toFixed(1)} mm)`;
    return { rect, aMm, dL, dLDetour, detourText, endY: nearestEndY(rect) };
  }, [slotLenMm, slotWMm, slotXMm, crossFrac, hMm, fixVias]);

  const dcParams: DcPlaneParams | null = useMemo(() => {
    if (tab !== 'slot' || slotView !== 'dc') return null;
    const r = slot.rect;
    return {
      W: BOARD.W * 1e-3,
      H: BOARD.H * 1e-3,
      nx: DC_GRID.nx,
      ny: DC_GRID.ny,
      slots: [{ x0: r.x0 * 1e-3, y0: r.y0 * 1e-3, x1: r.x1 * 1e-3, y1: r.y1 * 1e-3 }],
      source: { x: TRACE.x0 * 1e-3, y: TRACE.y * 1e-3 },
      sink: { x: TRACE.x1 * 1e-3, y: TRACE.y * 1e-3 },
      contactR: 1.5e-3,
    };
  }, [tab, slotView, slot.rect]);
  const { result: dcResult, solving: dcSolving } = useDcSolve(dcParams);

  const moat = useMemo(() => {
    const rect = moatRect(50, moatLenMm, moatWMm);
    const openEndY = BOARD.H - moatLenMm;
    const bridgeY = Math.min(BOARD.H - 2, Math.max(openEndY + 2, bridgeYMm));
    const capSrf = seriesCrossoverFrequency(STITCH_CAP.esl + STITCH_CAP.lMount, STITCH_CAP.C);
    if (moatFix === 'none') {
      const aMm = TRACE.y - openEndY;
      return {
        rect, openEndY, bridgeY, capSrf,
        dL: detourInductance(aMm * 1e-3, moatWMm * 1e-3, hMm * 1e-3, TRACE.wMm * 1e-3),
        detourText: `${(2 * aMm + moatWMm).toFixed(1)} mm around the moat end (a = ${aMm.toFixed(1)} mm)`,
        endY: openEndY,
      };
    }
    if (moatFix === 'bridge') {
      const aMm = Math.abs(TRACE.y - bridgeY);
      return {
        rect, openEndY, bridgeY, capSrf,
        dL: detourInductance(aMm * 1e-3, moatWMm * 1e-3, hMm * 1e-3, TRACE.wMm * 1e-3),
        detourText: aMm < 2
          ? 'trace routed over the bridge — no detour'
          : `${(2 * aMm + moatWMm).toFixed(1)} mm to the bridge (a = ${aMm.toFixed(1)} mm)`,
        endY: bridgeY,
      };
    }
    return {
      rect, openEndY, bridgeY, capSrf,
      dL: STITCH_CAP.esl + STITCH_CAP.lMount,
      detourText: 'through the stitch cap at the crossing',
      endY: TRACE.y,
    };
  }, [moatLenMm, moatWMm, moatFix, bridgeYMm, hMm]);

  const hop = useMemo(() => {
    const C = localPatchCapacitance(EPS_R, planeDMm * 1e-3, patchSideMm * 1e-3);
    const capSpec: CapSpec = { ...STITCH_CAP, C: capCnF * 1e-9 };
    const lCap = capSpec.esl + capSpec.lMount;
    const zPlanes = Float64Array.from(FREQS_HOP, (f) => zMag(zReturn(f, { kind: 'planes', C })));
    const zVia = Float64Array.from(FREQS_HOP, (f) => zMag(zReturn(f, { kind: 'via', L: L_VIA })));
    const zCap = Float64Array.from(FREQS_HOP, (f) => zMag(zReturn(f, { kind: 'cap', spec: capSpec })));
    const fCross = seriesCrossoverFrequency(L_VIA, C);
    const srf = seriesCrossoverFrequency(lCap, capSpec.C);
    const peaks: Peak[] = [
      { f: fCross, z: 2 * Math.PI * fCross * L_VIA, label: `via ↔ planes ${formatHz(fCross)}` },
      { f: srf, z: capSpec.esr, label: `cap SRF ${formatHz(srf)}` },
    ];
    return { C, capSpec, lCap, zPlanes, zVia, zCap, fCross, srf, peaks };
  }, [patchSideMm, planeDMm, capCnF]);

  return (
    <>
      <div className="panel">
        <div className="segmented" style={{ marginBottom: 12 }}>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'slot' && (
          <>
            <PlanViewCanvas
              scene={{
                corridorHalf: 3 * hMm,
                obstacle: slot.rect,
                detourEndY: slot.aMm > 0 ? slot.endY : null,
                viaPair: fixVias,
                mode: slotView,
                dc: dcResult,
                dcSolving,
              }}
            />
            <div className="checks" style={{ marginTop: 10 }}>
              <div className="segmented">
                <button className={slotView === 'dc' ? 'active' : ''}
                  onClick={() => setSlotView('dc')}>
                  DC
                </button>
                <button className={slotView === 'hf' ? 'active' : ''}
                  onClick={() => setSlotView('hf')}>
                  HF
                </button>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={fixVias}
                  onChange={(e) => setFixVias(e.target.checked)} />
                fix: stitch-via pair at the crossing ({VIA.hMm} mm × ⌀{VIA.dMm} mm each)
              </label>
            </div>
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Slot length" value={slotLenMm} min={2} max={50} step={0.5}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setSlotLenMm} />
              <Slider label="Slot width" value={slotWMm} min={0.5} max={5} step={0.1}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setSlotWMm} />
              <Slider label="Slot position" value={slotXMm} min={25} max={75} step={1}
                format={(v) => `x = ${v.toFixed(0)} mm`} onChange={setSlotXMm} />
              <Slider label="Crossing along slot" value={crossFrac} min={-1} max={1} step={0.05}
                format={(v) => `${((v * slotLenMm) / 2).toFixed(1)} mm from center`}
                onChange={setCrossFrac} />
              <Slider label="Trace height h" value={hMm} min={0.1} max={1} step={0.02}
                format={(v) => `${v.toFixed(2)} mm`} onChange={setHMm} />
            </div>
            <BounceStrip detourText={slot.detourText} dL={slot.dL}
              dIdtMaNs={dIdtMaNs} onDIdt={setDIdtMaNs} />
            <p className="caption">
              {slotView === 'dc'
                ? 'At DC the return spreads across the whole plane and simply squeezes ' +
                  'around the slot — barely any penalty. The damage is an HF phenomenon.'
                : fixVias
                  ? `Even the fix is not free: the return dives through one via, runs on the plane ` +
                    `below, and climbs back — 2 × L_via ≈ ${formatL(2 * L_VIA)} versus ` +
                    `${formatL(slot.dLDetour)} for the detour. Better, not gone.`
                  : 'At HF the return current cannot leave the ±3h corridor cheaply, so the slot ' +
                    'forces the whole bundle to the nearer slot end and back — the shaded ' +
                    'rectangle is loop area that did not exist before.'}
            </p>
          </>
        )}

        {tab === 'moat' && (
          <>
            <PlanViewCanvas
              scene={{
                corridorHalf: 3 * hMm,
                obstacle: moat.rect,
                detourEndY: moatFix === 'cap' ? null : moat.endY,
                bridgeY: moatFix === 'bridge' ? moat.bridgeY : null,
                capAtCrossing: moatFix === 'cap',
                mode: 'hf',
              }}
            />
            <div className="checks" style={{ marginTop: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>fix:</span>
              <div className="segmented">
                <button className={moatFix === 'none' ? 'active' : ''}
                  onClick={() => setMoatFix('none')}>
                  none
                </button>
                <button className={moatFix === 'bridge' ? 'active' : ''}
                  onClick={() => setMoatFix('bridge')}>
                  copper bridge
                </button>
                <button className={moatFix === 'cap' ? 'active' : ''}
                  onClick={() => setMoatFix('cap')}>
                  stitch capacitor
                </button>
              </div>
            </div>
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Moat length (from top edge)" value={moatLenMm} min={32} max={58}
                step={0.5} format={(v) => `${v.toFixed(1)} mm`} onChange={setMoatLenMm} />
              <Slider label="Moat width" value={moatWMm} min={1} max={5} step={0.1}
                format={(v) => `${v.toFixed(1)} mm`} onChange={setMoatWMm} />
              {moatFix === 'bridge' && (
                <Slider label="Bridge position" value={bridgeYMm} min={5} max={58} step={0.5}
                  format={(v) => `y = ${v.toFixed(1)} mm`} onChange={setBridgeYMm} />
              )}
              <Slider label="Trace height h" value={hMm} min={0.1} max={1} step={0.02}
                format={(v) => `${v.toFixed(2)} mm`} onChange={setHMm} />
            </div>
            <BounceStrip detourText={moat.detourText} dL={moat.dL}
              dIdtMaNs={dIdtMaNs} onDIdt={setDIdtMaNs} />
            <p className="caption">
              {moatFix === 'none' &&
                'The moat nearly splits the plane, so the return must round its far end — the ' +
                'worst detour on this board. If the split is intentional (analog moat), the ' +
                'answer is not to cross it at all.'}
              {moatFix === 'bridge' &&
                'A copper bridge gives the return a legal crossing — but only where the bridge ' +
                'is. Move it away from the trace and the detour comes right back: the routing ' +
                'rule is “route the trace over the bridge”.'}
              {moatFix === 'cap' &&
                `A stitch capacitor closes the loop for AC only, and cheaply only near its ` +
                `series resonance (${formatHz(moat.capSrf)} here): below it the cap is a ` +
                `capacitor, above it it is just its own ${formatL(STITCH_CAP.esl + STITCH_CAP.lMount)} ` +
                `of package + mounting inductance (Module 4).`}
            </p>
          </>
        )}

        {tab === 'hop' && (
          <>
            <LayerHopView />
            <div className="controls" style={{ marginTop: 12 }}>
              <Slider label="Local reach patch" value={patchSideMm} min={5} max={30} step={1}
                format={(v) => `${v.toFixed(0)} × ${v.toFixed(0)} mm`} onChange={setPatchSideMm} />
              <Slider label="P1–P2 spacing d" value={planeDMm} min={0.1} max={1} step={0.02}
                format={(v) => `${v.toFixed(2)} mm`} onChange={setPlaneDMm} />
              <Slider label="Stitch cap C" value={capCnF} min={1} max={1000} log
                format={(v) => (v >= 1000 ? '1 µF' : `${v.toFixed(0)} nF`)} onChange={setCapCnF} />
            </div>
            <div className="readouts" style={{ marginTop: 10 }}>
              <div className="readout">
                <div className="label">interplane C (εr = {EPS_R}, patch)</div>
                <div className="value">{(hop.C * 1e12).toFixed(1)} pF</div>
              </div>
              <div className="readout">
                <div className="label">stitching via L ({VIA.hMm} mm × ⌀{VIA.dMm} mm)</div>
                <div className="value">{formatL(L_VIA)}</div>
              </div>
              <div className="readout">
                <div className="label">via beats bare planes below</div>
                <div className="value">{formatHz(hop.fCross)}</div>
              </div>
              <div className="readout">
                <div className="label">stitch cap SRF (L_tot = {formatL(hop.lCap)})</div>
                <div className="value">{formatHz(hop.srf)}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <PdnPlot
                freqs={FREQS_HOP}
                curves={[
                  { label: 'nothing: planes only', color: '#199e70', width: 2, z: hop.zPlanes },
                  { label: 'stitching via (same net)', color: '#3987e5', width: 2, z: hop.zVia },
                  { label: 'stitch cap (different nets)', color: '#9085e9', width: 2, z: hop.zCap },
                ]}
                hoverIndex={1}
                peaks={hop.peaks}
                bands={HOP_BANDS}
              />
            </div>
            <p className="caption">
              |Z| between the two reference planes — what the return current must cross at the
              hop. A stitching via wins almost everywhere (same-net planes only); the bare
              interplane capacitance only takes over near {formatHz(hop.fCross)}; a stitch cap
              is a narrowband fix around its {formatHz(hop.srf)} resonance and turns inductive
              above it. Everything above the curves&apos; low-Ω region becomes loop area,
              bounce, and EMI.
            </p>
          </>
        )}
      </div>

      <PhysicsPanel>
        <p>
          <strong>The corridor model.</strong> At HF the plane&apos;s return current is the
          image of the trace current: density{' '}
          <Equation tex="J(x) = \frac{I}{\pi h}\,\frac{1}{1+(x/h)^2}" /> (Module 1), so
          ~80&nbsp;% of it flows within ±3h of the trace. Any copper break inside that
          corridor forces a detour; at DC nothing of the sort happens — the DC view solves
          steady conduction <Equation tex="\nabla\cdot(\sigma\nabla\varphi)=0" /> (the same
          elliptic operator, and the very same SOR solver, as Module 2&apos;s electrostatics)
          and shows the current spreading plane-wide.
        </p>
        <p>
          <strong>Detour inductance (order-of-magnitude estimate).</strong> The detour is
          modeled as a Grover rectangle (Module 5&apos;s Rosa/Grover formula): sides a
          (crossing → obstacle end or bridge) × b (slot width), conductor radius{' '}
          <Equation tex="r_\mathrm{eff} = \max\!\big(w/2,\ \min(3h,\ b/4,\ a/4)\big)" /> — the
          return bundle is about as wide as the ±3h corridor, capped at a quarter of either
          side for thin-wire validity, floored at the trace half-width. Ignored: spreading
          beyond the corridor, coupling to the signal trace, slot-antenna radiation. Treat ΔL
          as a decade-accurate engineering number, not a field solution.
        </p>
        <p>
          <strong>Via inductance.</strong>{' '}
          <Equation tex="L = 5.08\,h\left[\ln\frac{4h}{d} + 1\right]\ \mathrm{nH}\ (h,d\ \text{in inches})" />{' '}
          — Johnson &amp; Graham, <em>High-Speed Digital Design</em>, 1993, ch. 7 (Vias),
          &ldquo;Inductance of a Via&rdquo;. A 1.6&nbsp;mm × ⌀0.25&nbsp;mm barrel is{' '}
          {formatL(L_VIA)}; a partial inductance, so it only predicts anything once the whole
          return loop is closed (Module 5).
        </p>
        <p>
          <strong>Layer-hop return impedance.</strong> Nothing:{' '}
          <Equation tex="Z = 1/j\omega C" /> with C = ε0εr·A/d over a local patch (Module
          3&apos;s interplane capacitance; the patch stands in for the frequency-dependent
          spreading reach). Stitching via: <Equation tex="Z = j\omega L_\mathrm{via}" />{' '}
          (plane spreading inductance neglected). Stitch cap: Module 4&apos;s series RLC{' '}
          <Equation tex="Z = \mathrm{ESR} + j\big(\omega L_\mathrm{tot} - 1/\omega C\big)" />{' '}
          with L_tot = ESL + Module 5&apos;s mounting-loop inductance. Crossovers at{' '}
          <Equation tex="f = 1/2\pi\sqrt{LC}" />.
        </p>
        <p>
          <strong>When each fix works.</strong> Stitch vias: same-net planes only, broadband,
          still ~{formatL(L_VIA)} each — place a pair right at the crossing. Copper bridge:
          restores a true corridor, but only under traces routed over it. Stitch cap:
          different-net planes, narrowband around its SRF, inductive above it. Best fix:
          don&apos;t interrupt the corridor at all.
        </p>
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>
            The detour rectangle and its r_eff clamp are a pedagogical construction on top of
            Module 1&apos;s corridor result and Grover&apos;s rectangle — good to a factor of
            ~2, honest about being an estimate.
          </li>
          <li>
            The DC solve treats the plane as a uniform 2D resistive sheet with insulating
            slots (zero-flux edges); current magnitudes are per unit sheet conductance.
          </li>
          <li>
            The layer-hop &ldquo;local reach&rdquo; patch is user-set; the real interplane
            reach grows with wavelength and the plane pair has cavity resonances that this
            lumped model omits (Modules 4 and 7).
          </li>
          <li>Ground bounce V = ΔL·dI/dt assumes the full signal current swings in Δt.</li>
        </ul>
      </PhysicsPanel>
    </>
  );
}
