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
  modules/      One folder per module + registry.tsx (metadata, groups, status)
  components/   App shell: Sidebar, Slider, PhysicsPanel, Equation, Readout
  styles.css    Dark theme, CSS custom properties (palette tokens at :root)
```

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
| 2 | Fields around a trace (2D electrostatic solver, E-field, Z0 vs geometry) | Fundamentals | Stub |
| 3 | Stackup explorer (2/4/6-layer, field containment, good vs bad) | Stackup & Impedance | Stub |
| 4 | Decoupling capacitors (\|Z\| vs f, ESR/ESL, anti-resonance) | Power Integrity | Stub |
| 5 | Loop inductance (loop area, HF dominance) | Power Integrity | Stub |
| 6 | Crosstalk (coupling vs spacing and height) | SI & EMC | Stub |
| 7 | Wave playground (2D FDTD sandbox: reflections, shielding, via fences) | SI & EMC | Stub |
| 8 | Grounding sins (slot under trace, split planes) | SI & EMC | Stub |

Module 1 physics: HF return current density J(x) = I/(π·h)·1/(1+(x/h)²); DC limit uniform
I/W; blended by a logistic in log10(f) centered near 10 kHz (labeled in the UI as a
pedagogical approximation); skin depth δ = √(2ρ/ωµ) with ρ_Cu = 1.68e-8 Ω·m. The slot
model is schematic/qualitative and labeled as such.

## Conventions

- Keep diffs small; edit in place; no orphaned code.
- Update this file in the same change whenever architecture or module status changes.
- Verify before declaring done: `npm test` and `npm run build` must pass.
