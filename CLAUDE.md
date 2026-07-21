# EM Fields PCB Educational Tool

Interactive web app that teaches how electromagnetic fields actually behave on PCBs:
return currents, stackup, impedance, decoupling, coupling, grounding, shielding.
Every module is a live visualization driven by sliders.

**Audience:** EE students and practicing engineers. Correctness and honest labeling of
approximations matter more than visual flash.

## Stack

- Vite + React + TypeScript (strict). No backend — builds to a static site (`npm run build`).
- Canvas 2D for field/current visualizations (one React component per canvas,
  devicePixelRatio-aware, redraw in `useEffect`).
- KaTeX for equations (render via `katex.renderToString` in `src/components/Equation.tsx`).
- Vitest for tests (`npm test`). Physics tests run in a plain node environment.
- State management: plain React `useState`/`useMemo` per module. No global store, no router —
  the active module is a single piece of state in `App.tsx`.

## Layout

```
src/
  physics/      Pure physics functions + their .test.ts files (see rules below)
  workers/      Web Workers wrapping heavy solvers (fieldSolver.worker.ts, fdtd.worker.ts)
  modules/      One folder per module + registry.ts (metadata, groups, status)
  components/   App shell: Sidebar, Slider, PhysicsPanel, Equation, colors, useCanvasDraw
  styles.css    Dark theme, CSS custom properties (palette tokens at :root)
```

Reusable numerics: `src/physics/electrostatic.ts` is a geometry-agnostic 2D
∇·(ε∇φ) = 0 solver (finite volumes, cell-centered εr, red-black SOR); geometry
builders (e.g. `traceGeometry.ts`) produce `ElectrostaticProblem`s for it, and
`transmissionLine.ts` turns the two-solve capacitances (real εr and vacuum)
into quasi-TEM L′, Z₀, ε_eff, v_p. Module 3 should reuse all of this.
Multi-conductor support (Module 6): N Dirichlet regions at independent
potentials with per-conductor free charge via `conductorCharge` (discrete
Gauss law, exactly consistent with the stencil); the energy path stays for
single-conductor solves. `buildCoupledPairProblem` meshes a symmetric pair.
Solves run in `src/workers/fieldSolver.worker.ts` (debounced, warm-started).

## Physics rules (non-negotiable)

1. **All physics lives in `src/physics/`** as pure TypeScript functions. No DOM, no React,
   no imports from outside `src/physics/`. This keeps the layer ready to move into Web
   Workers when heavy numerical solvers (electrostatic, FDTD) arrive.
2. **SI units everywhere** (m, s, Hz, A, Ω, H). Convert to mm/µm/GHz only at the UI layer.
3. **JSDoc on every physics function** citing the formula and its source (textbook/paper),
   listing parameter units, and flagging any pedagogical approximation as such.
4. **Every physics function gets a Vitest validation test** against a known reference value
   (e.g. skin depth of Cu ≈ 66 µm at 1 MHz), not just self-consistency.
5. **Every module's UI has a collapsible "The Physics" panel** stating the model, the
   governing equations (KaTeX), and an explicit list of assumptions/approximations.

## Visualization conventions

- Dark theme only (field plots read better on dark). Palette tokens live in `styles.css`:
  surface `#1a1a19`, page `#0d0d0d`, series colors blue `#3987e5` / aqua `#199e70` /
  yellow `#c98500`, sequential heatmaps use the one-hue blue ramp (dark = zero, bright = max).
- Line plots: 2px lines, recessive hairline grid (`#2c2c2a`), muted axis ink (`#898781`),
  legend whenever ≥ 2 series, hover crosshair with value readout.
- Text never wears a series color; labels use the ink tokens.

## Module roadmap

Groups: Fundamentals / Stackup & Impedance / Power Integrity / SI & EMC.

| # | Module | Group | Status |
|---|--------|-------|--------|
| 1 | Where does return current flow? | Fundamentals | **Implemented** |
| 2 | Fields around a trace (2D electrostatic solver, E-field, Z0 vs geometry) | Fundamentals | **Implemented** |
| 3 | Stackup explorer (2/4/6-layer, field containment, good vs bad) | Stackup & Impedance | **Implemented** |
| 4 | Decoupling capacitors (\|Z\| vs f, ESR/ESL, anti-resonance) | Power Integrity | **Implemented** |
| 5 | Loop inductance (loop area, HF dominance) | Power Integrity | **Implemented** |
| 6 | Crosstalk (coupling vs spacing and height) | SI & EMC | **Implemented** |
| 7 | Wave playground (2D FDTD sandbox: reflections, shielding, via fences) | SI & EMC | **Implemented** |
| 8 | Grounding sins (slot under trace, split planes) | SI & EMC | Stub |

Module 1 physics: HF return current density J(x) = I/(π·h)·1/(1+(x/h)²); DC limit uniform
I/W; blended by a logistic in log10(f) centered near 10 kHz (labeled in the UI as a
pedagogical approximation); skin depth δ = √(2ρ/ωµ) with ρ_Cu = 1.68e-8 Ω·m. The slot
model is schematic/qualitative and labeled as such.

Module 2 physics: quasi-TEM microstrip/stripline via the electrostatic solver and the
two-solve method (see above); validated against parallel-plate closed forms and
Hammerstad–Jensen (Z₀ and ε_eff within 5 % at w/h = 1 and 2, εr = 4.4), plus a
grid-doubling convergence test (< 2 % Z₀ shift).

Module 3 physics: offset-stripline geometry added to the builder (reduces exactly to
symmetric stripline when clearances match); solver validated against Cohn's exact
stripline solution (within 3 %); width-for-50 Ω synthesis = closed-form guess + ≤ 3
solver secant steps (round-trip within 1 Ω); interplane C″ = ε0εr/d. The worker gained
an 'invert' task and cache tags; stackup heuristics (scorecard) live in the module.

Module 4 physics (src/physics/pdn.ts, closed forms only — no worker): capacitor as
series RLC Z = ESR + j(ωL_tot − 1/ωC) with L_tot = ESL + L_mount; SRF; parallel
Z = 1/Σ(nᵢ/Zᵢ); plane branch reuses Module 3's C″ (in series with ~10 pH); target
Z_t = V·ripple/ΔI; anti-resonance peak detection. Validated: RLC asymptotes < 1 %,
|Z(SRF)| = ESR, army |Z|/n exact, decade-spread peak exists and ESR damps it.

Module 5 physics (src/physics/loopInductance.ts, closed forms only — no worker):
rectangular-loop external L from Rosa/Grover partial-inductance sums (square loop
10 cm / 0.5 mm wire = 361.9 nH reference); LF internal L = µ0/(8π) per meter of wire
(toggle, justified by Module 1's skinDepth, which is re-exported — never reimplemented);
wire pair L′ = (µ0/π)acosh(D/2r); trace-over-plane L′ = µ0h/w vs. Hammerstad–Jensen
Z₀(εr=1)/c (the gap is fringing); cap mounting loop = rectangle (span + 2·escape) ×
depth-to-plane with r_eff = 0.2235(w+t) GMD strip radius, labeled ~±30 % estimate
(model runs ~2–3× above Module 4's folk presets; discrepancy is flagged in the UI,
not tuned away); R(f) = DC → skin-shell ρl/(π(r²−(r−δ)²)); crossover ωL = R by
bisection (default loop ≈ 3.8 kHz); ground bounce V = L·ΔI/Δt. Depth presets come
from Module 3's stackups. UI: scenario tabs with the shaded loop area as the star.

Module 6 physics (src/physics/crosstalk.ts + solver extension): even/odd analysis
of the symmetric pair — solve (1,1) and (1,−1) each with real εr and vacuum, per-line
C from conductorCharge → Z_even = 1/(c√(C_e·C_e0)), Z_odd likewise, Z_diff = 2·Z_odd,
Z_comm = Z_even/2; Cm/Cs = (C_o−C_e)/(C_o+C_e), Lm/Ls = (L_e−L_o)/(L_e+L_o) with
L = 1/(c²·C0). Weak-coupling matched-end crosstalk (Hall & Heck 2009 ch. 4):
NEXT Kb = ¼(Cm/Cs+Lm/Ls), duration 2·TD, saturating at 2·TD ≥ t_r; FEXT
Kf = ½(Cm/Cs−Lm/Ls)·TD/t_r, width ≈ t_r, negative for microstrip (sign convention in
JSDoc); TD from the isolated line's ε_eff. Closed-form pulse sketches only — no FDTD.
Validated: odd ≡ Dirichlet-0 wall / even ≡ Neumann wall (1 %), isolation limit s/h=10
vs Module 2's Z₀ (3 %), stripline Lm/Ls = Cm/Cs (homogeneity, 2 %), Cm/Cs monotone in
s, NEXT length-independent when saturated / FEXT linear, grid-doubling Z_odd < 2 %.
Worker gained 'pair' (5 pair + 2 isolated solves, warm-started) and 'pairSweep'
(coarse-grid spacing sweep on drag-release, cached per geometry) tasks.

Module 7 physics (src/physics/fdtd.ts + src/workers/fdtd.worker.ts): 2D FDTD, TMz
(Ez, Hx, Hy) on a Yee grid, leapfrog updates (Yee 1966; Taflove & Hagness 3rd ed.);
dt = S·dx/(c√2) with S = 0.99, createSim throws for S > 1 (allowUnstable for the
divergence test); per-node εr map + PEC mask; boundaries: PEC, PMC (missing
outside-H terms → the magnetic wall sits half a cell outside the Ez boundary, so a
PMC cavity is exactly nx·dx × ny·dx), first-order Mur ABC (Mur 1981) matched to the
local c′ = c/√εr; soft Gaussian/CW point sources; probes + FFT helpers (Hann,
zero-pad, parabolic peak) and analytic f_mn = c/(2√εr)·√((m/a)²+(n/b)²). Validated:
pulse speed = c and c/2 within 2 % (quasi-1D PMC rig with a uniform source column —
no 2D wake), Courant guard + S = 1.05 divergence, Mur normal-incidence residual < 5 %
measured against a large-PEC reference run (the difference isolates the ABC
reflection from the outgoing wake), cavity f₁₀ within 3 % of the 722.9 MHz analytic
value, PEC-box energy bounded over 10 000 steps, off-bin sine peak within 0.1 %.
Worker protocol: rAF-driven 'frame' requests carrying transferable ping-pong
ArrayBuffers (zero per-frame allocation; steps-per-frame configurable, default 8;
the 200×120 @ 0.5 mm board runs at display rate). Scenario builders
(cavity / via fence / slot / shielded box) in src/modules/wave-playground/scenarios.ts.
Display note: the Ez heatmap is diverging blue–dark–red (dark = zero), not
blue-white-red — a white midpoint would fight the dark-theme plot conventions.

Browser verification notes: Chrome throttles timers and suspends
requestAnimationFrame in hidden/occluded tabs — keep the tab foregrounded during
automated browser checks. Hidden-tab throttling masquerades as a solve hang
(Module 6's debounce) and as 0 fps (Module 7, where suspending is deliberate).
Live-check screenshots from the Module 6/7 verification live in docs/verification/.

## Conventions

- Keep diffs small; edit in place; no orphaned code.
- Update this file in the same change whenever architecture or module status changes.
- Verify before declaring done: `npm test` and `npm run build` must pass.
