import { useState } from 'react';
import { fractionWithin, returnSpread } from '../../physics/returnCurrent';
import { skinDepth } from '../../physics/skinDepth';
import { Equation } from '../../components/Equation';
import { PhysicsPanel } from '../../components/PhysicsPanel';
import { Slider } from '../../components/Slider';
import { CrossSectionCanvas } from './CrossSectionCanvas';
import { CurrentDensityPlot } from './CurrentDensityPlot';

const SLOT_WIDTH_MM = 3;

export function ReturnCurrentModule() {
  const [hMm, setHMm] = useState(0.5);
  const [wMm, setWMm] = useState(0.3);
  const [WMm, setWWMm] = useState(20);
  const [f, setF] = useState(1e8);
  const [slot, setSlot] = useState(false);

  const slotWidthMm = Math.min(SLOT_WIDTH_MM, WMm / 3);
  const p = { h: hMm * 1e-3, W: WMm * 1e-3, f, I: 1 };

  const within3h = fractionWithin(3 * hMm * 1e-3, p);
  const delta = skinDepth(f);

  // Qualitative loop-area index: h + lateral spread of the return current,
  // relative to its DC-limit value; tripled (and capped) when the slot forces
  // the return path to detour. Schematic only — not a computed inductance.
  const spread = returnSpread(p);
  let loopGauge = (hMm * 1e-3 + spread) / (hMm * 1e-3 + p.W / 4);
  if (slot) loopGauge = Math.min(1, loopGauge * 3);
  const loopLabel = slot
    ? 'ballooned — slot in return path!'
    : loopGauge < 0.35
      ? 'low — tight loop'
      : loopGauge < 0.7
        ? 'moderate'
        : 'high — spread-out return';

  return (
    <>
      <div className="panel">
        <h3>Cross-section (return current density painted on the plane)</h3>
        <CrossSectionCanvas
          hMm={hMm}
          wMm={wMm}
          WMm={WMm}
          f={f}
          slot={slot}
          slotWidthMm={slotWidthMm}
        />
      </div>

      <div className="panel">
        <h3>Return current density J(x) across the plane</h3>
        <CurrentDensityPlot hMm={hMm} WMm={WMm} f={f} slot={slot} slotWidthMm={slotWidthMm} />
        <p className="caption">
          The DC↔HF blend vs. frequency is a pedagogical approximation (logistic in log₁₀ f,
          centered near 10 kHz) — the true transition depends on plane resistance and geometry.
          {slot && ' The slot curve is schematic, not a field solution.'}
        </p>
      </div>

      <div className="panel">
        <h3>Controls</h3>
        <div className="controls">
          <Slider
            label="Trace height h"
            value={hMm}
            min={0.1}
            max={2}
            step={0.01}
            format={(v) => `${v.toFixed(2)} mm`}
            onChange={setHMm}
          />
          <Slider
            label="Trace width w"
            value={wMm}
            min={0.1}
            max={2}
            step={0.01}
            format={(v) => `${v.toFixed(2)} mm`}
            onChange={setWMm}
          />
          <Slider
            label="Plane width W"
            value={WMm}
            min={5}
            max={50}
            step={0.5}
            format={(v) => `${v.toFixed(1)} mm`}
            onChange={setWWMm}
          />
          <Slider
            label="Frequency f"
            value={f}
            min={10}
            max={1e9}
            log
            format={formatFreq}
            onChange={setF}
          />
        </div>
        <p style={{ marginBottom: 0 }}>
          <label className="toggle">
            <input type="checkbox" checked={slot} onChange={(e) => setSlot(e.target.checked)} />
            Cut a slot in the plane under the trace ({slotWidthMm.toFixed(1)} mm, schematic)
          </label>
        </p>
      </div>

      <div className="panel">
        <h3>Readouts</h3>
        <div className="readouts">
          <div className="readout">
            <div className="label">Return current within ±3h of centerline</div>
            <div className="value">{(within3h * 100).toFixed(1)} %</div>
            <div className="note">→ ≈ 80 % in the HF limit over a wide plane</div>
          </div>
          <div className="readout">
            <div className="label">Copper skin depth δ at {formatFreq(f)}</div>
            <div className="value">{formatLength(delta)}</div>
            <div className="note">≈ 66 µm at 1 MHz, ≈ 2.1 µm at 1 GHz</div>
          </div>
          <div className="readout">
            <div className="label">Loop area index (qualitative)</div>
            <div className="value" style={{ fontSize: 14 }}>{loopLabel}</div>
            <div className="gauge">
              <div className={slot ? 'hot' : ''} style={{ width: `${loopGauge * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <PhysicsPanel>
        <p>
          <strong>Current takes the lowest-impedance path.</strong> The return path presents
          an impedance <Equation tex="Z = R + j\omega L" />. At DC the <Equation tex="R" />
          {' '}term dominates, so current spreads across the whole plane to minimize
          resistance. At high frequency the <Equation tex="\omega L" /> term dominates, so
          current crowds directly under the trace — that path minimizes loop area and hence
          loop inductance. The crossover typically happens between a few hundred Hz and a
          few hundred kHz.
        </p>
        <p>
          <strong>HF limit</strong> (image-current result for a filament at height{' '}
          <Equation tex="h" /> over an infinite plane; Ott 2009, eq. 10-1):
        </p>
        <Equation display tex="J(x) = \frac{I}{\pi h}\,\frac{1}{1 + (x/h)^2}" />
        <p>
          This distribution has FWHM <Equation tex="= 2h" /> and puts{' '}
          <Equation tex="\tfrac{2}{\pi}\arctan 3 \approx 80\,\%" /> of the current within{' '}
          <Equation tex="\pm 3h" /> of the centerline. <strong>DC limit:</strong>{' '}
          <Equation tex="J(x) = I/W" />, uniform across the plane.
        </p>
        <p>
          <strong>Skin depth</strong> (why "the plane" is really only its surface at HF):
        </p>
        <Equation display tex="\delta = \sqrt{\frac{2\rho}{\omega\mu}},\qquad \rho_{\mathrm{Cu}} = 1.68\times10^{-8}\,\Omega\!\cdot\!\mathrm{m}" />
        <p>
          <strong>Regime blend</strong> shown in the plot:{' '}
          <Equation tex="J = w\,J_{\mathrm{HF}} + (1-w)\,J_{\mathrm{DC}}" /> with{' '}
          <Equation tex="w(f) = \left[1 + e^{-(\log_{10} f - 4)/0.7}\right]^{-1}" />, centered
          at 10 kHz and spanning roughly 100 Hz – 1 MHz.
        </p>
        <p><strong>Assumptions &amp; approximations:</strong></p>
        <ul>
          <li>
            HF limit treats the trace as a thin filament over an infinite, perfectly
            conducting plane (image theory); trace width w only affects the drawing.
          </li>
          <li>
            The logistic DC↔HF blend is pedagogical — the real transition frequency depends
            on plane sheet resistance and loop geometry.
          </li>
          <li>
            The slot model is schematic: blocked current is re-deposited at the slot edges.
            In reality the return detours around the slot ends (out of this cross-section),
            enlarging the loop far more than any 2D picture can show.
          </li>
          <li>Plane edges are ignored except for truncation/normalization at ±W/2.</li>
        </ul>
      </PhysicsPanel>
    </>
  );
}

function formatFreq(f: number): string {
  if (f >= 1e9) return `${(f / 1e9).toFixed(2)} GHz`;
  if (f >= 1e6) return `${(f / 1e6).toFixed(1)} MHz`;
  if (f >= 1e3) return `${(f / 1e3).toFixed(1)} kHz`;
  return `${f.toFixed(0)} Hz`;
}

function formatLength(m: number): string {
  if (m >= 1e-3) return `${(m * 1e3).toFixed(2)} mm`;
  return `${(m * 1e6).toFixed(1)} µm`;
}
